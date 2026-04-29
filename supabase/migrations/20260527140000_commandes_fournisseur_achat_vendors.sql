-- Achat lots : vendeurs par fournisseur, besoin figé, marque ligne, frais par vendeur, insert ligne lot (achete)

create table if not exists public.ref_supplier_vendeur (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.ref_supplier (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ref_supplier_vendeur_supplier on public.ref_supplier_vendeur (supplier_id);

alter table public.commande_fournisseur_lot_ligne
  add column if not exists qte_besoin_fige integer
    check (qte_besoin_fige is null or qte_besoin_fige >= 0);

alter table public.commande_fournisseur_lot_ligne
  add column if not exists vendeur_id uuid references public.ref_supplier_vendeur (id) on delete set null;

alter table public.commande_fournisseur_lot_ligne
  add column if not exists marque_achete boolean not null default false;

alter table public.commande_fournisseur_lot_frais
  add column if not exists vendeur_id uuid references public.ref_supplier_vendeur (id) on delete set null;

create index if not exists idx_cfll_vendeur on public.commande_fournisseur_lot_ligne (vendeur_id);
create index if not exists idx_cflf_vendeur on public.commande_fournisseur_lot_frais (vendeur_id);

comment on column public.commande_fournisseur_lot_ligne.qte_besoin_fige is
  'Somme magasins figée au passage du lot en « prêt » ; affichage achete (non recalculée).';
comment on column public.commande_fournisseur_lot_ligne.marque_achete is
  'Repère visuel suivi achete (uniquement si vendeur_id renseigné).';
comment on column public.commande_fournisseur_lot_frais.vendeur_id is
  'Null = frais généraux au lot ; sinon frais rattachés au vendeur.';

alter table public.commande_fournisseur_lot_ligne
  drop constraint if exists commande_fournisseur_lot_ligne_marque_achete_vendeur;

alter table public.commande_fournisseur_lot_ligne
  add constraint commande_fournisseur_lot_ligne_marque_achete_vendeur
  check (marque_achete = false or vendeur_id is not null);

-- RLS vendeurs (aligné réf. fournisseur : authentifié)
alter table public.ref_supplier_vendeur enable row level security;

drop policy if exists "ref_supplier_vendeur all authenticated" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur all authenticated"
  on public.ref_supplier_vendeur for all
  to authenticated
  using (true)
  with check (true);

-- Insert ligne lot : acheteur, lot « prêt » uniquement
drop policy if exists "cfll insert achat prete" on public.commande_fournisseur_lot_ligne;
create policy "cfll insert achat prete"
  on public.commande_fournisseur_lot_ligne for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = commande_fournisseur_lot_ligne.lot_id
        and l.status = 'prete'
    )
  );

-- Lots déjà prêts / terminés : figer un besoin rétroactif à partir des magasins (one-shot)
-- Postgres : l’alias de la table mise à jour (ll) n’est pas utilisable dans ON d’un JOIN du FROM —
-- filtrer ll ↔ l dans le WHERE.
update public.commande_fournisseur_lot_ligne ll
set qte_besoin_fige = sub.total
from (
  select
    lls.lot_ligne_id,
    coalesce(sum(lls.qte), 0)::integer as total
  from public.commande_fournisseur_lot_ligne_magasin lls
  group by lls.lot_ligne_id
) sub,
public.commande_fournisseur_lot l
where ll.id = sub.lot_ligne_id
  and l.id = ll.lot_id
  and ll.qte_besoin_fige is null
  and l.status in ('prete', 'terminee');

-- Clôture acheteurs : passer le lot « prêt » → « terminée » (achete uniquement ; consolidation garde ses policies)
drop policy if exists "cflot update achat cloture" on public.commande_fournisseur_lot;

create policy "cflot update achat cloture"
  on public.commande_fournisseur_lot for update to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'prete'
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'terminee'
  );
