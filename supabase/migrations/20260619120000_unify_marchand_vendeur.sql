-- Unifier marchands (ref_marchand) et vendeurs achat (ref_supplier_vendeur) : une seule entité « vendeur » par fournisseur.

comment on table public.ref_supplier_vendeur is
  'Vendeur / marchand côté achat, rattaché à un fournisseur (catalogue produit et lots d’achat).';

-- Libellé unique par fournisseur (insensible à la casse)
create unique index if not exists ref_supplier_vendeur_supplier_label_lower_idx
  on public.ref_supplier_vendeur (supplier_id, lower(btrim(label)));

-- ---------------------------------------------------------------------------
-- Liaison conditionnement produit ↔ vendeur (remplace product_packaging_marchand)
-- ---------------------------------------------------------------------------
create table if not exists public.product_packaging_vendeur (
  product_packaging_id uuid not null references public.product_packaging (id) on delete cascade,
  vendeur_id uuid not null references public.ref_supplier_vendeur (id) on delete restrict,
  primary key (product_packaging_id, vendeur_id)
);

create index if not exists product_packaging_vendeur_vendeur_id_idx
  on public.product_packaging_vendeur (vendeur_id);

comment on table public.product_packaging_vendeur is
  'Vendeurs éligibles pour ce conditionnement produit (même référentiel que les lots d’achat).';

alter table public.product_packaging_vendeur enable row level security;

drop policy if exists "all authenticated product_packaging_vendeur" on public.product_packaging_vendeur;
create policy "all authenticated product_packaging_vendeur"
  on public.product_packaging_vendeur for all to authenticated using (true) with check (true);

-- Créer les vendeurs manquants à partir des marchands encore orphelins (tous fournisseurs)
insert into public.ref_supplier_vendeur (supplier_id, label, sort_order)
select rs.id, m.label, m.sort_order
from public.ref_marchand m
cross join public.ref_supplier rs
where not exists (
  select 1
  from public.ref_supplier_vendeur v
  where v.supplier_id = rs.id
    and lower(btrim(v.label)) = lower(btrim(m.label))
);

-- Paires (conditionnement, fournisseur, libellé marchand) via fournisseurs du colis ou fournisseur produit
with ppm_supplier as (
  select distinct
    ppm.product_packaging_id,
    pps.supplier_id,
    m.label,
    m.sort_order
  from public.product_packaging_marchand ppm
  join public.ref_marchand m on m.id = ppm.marchand_id
  join public.product_packaging_supplier pps on pps.product_packaging_id = ppm.product_packaging_id
  union
  select distinct
    ppm.product_packaging_id,
    p.supplier_id,
    m.label,
    m.sort_order
  from public.product_packaging_marchand ppm
  join public.ref_marchand m on m.id = ppm.marchand_id
  join public.product_packaging pp on pp.id = ppm.product_packaging_id
  join public.product p on p.id = pp.product_id
  where not exists (
    select 1
    from public.product_packaging_supplier pps
    where pps.product_packaging_id = ppm.product_packaging_id
  )
)
insert into public.ref_supplier_vendeur (supplier_id, label, sort_order)
select ps.supplier_id, ps.label, ps.sort_order
from ppm_supplier ps
where not exists (
  select 1
  from public.ref_supplier_vendeur v
  where v.supplier_id = ps.supplier_id
    and lower(btrim(v.label)) = lower(btrim(ps.label))
);

insert into public.product_packaging_vendeur (product_packaging_id, vendeur_id)
select distinct ps.product_packaging_id, v.id
from (
  select distinct
    ppm.product_packaging_id,
    pps.supplier_id,
    m.label
  from public.product_packaging_marchand ppm
  join public.ref_marchand m on m.id = ppm.marchand_id
  join public.product_packaging_supplier pps on pps.product_packaging_id = ppm.product_packaging_id
  union
  select distinct
    ppm.product_packaging_id,
    p.supplier_id,
    m.label
  from public.product_packaging_marchand ppm
  join public.ref_marchand m on m.id = ppm.marchand_id
  join public.product_packaging pp on pp.id = ppm.product_packaging_id
  join public.product p on p.id = pp.product_id
  where not exists (
    select 1
    from public.product_packaging_supplier pps
    where pps.product_packaging_id = ppm.product_packaging_id
  )
) ps
join public.ref_supplier_vendeur v
  on v.supplier_id = ps.supplier_id
 and lower(btrim(v.label)) = lower(btrim(ps.label))
on conflict do nothing;

drop table if exists public.product_packaging_marchand;

drop trigger if exists trg_ref_marchand_code on public.ref_marchand;
drop table if exists public.ref_marchand;

-- RLS vendeurs : Paramètres + achat
drop policy if exists "ref_supplier_vendeur select achat ou renommer" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur select"
  on public.ref_supplier_vendeur for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer')
    or public.current_role_has_permission('parametres.read')
    or public.current_role_has_permission('parametres.write')
  );

drop policy if exists "ref_supplier_vendeur insert achat" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur insert achat"
  on public.ref_supplier_vendeur for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('parametres.write')
  );

drop policy if exists "ref_supplier_vendeur update renommer" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur update renommer"
  on public.ref_supplier_vendeur for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer')
    or public.current_role_has_permission('parametres.write')
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer')
    or public.current_role_has_permission('parametres.write')
  );

drop policy if exists "ref_supplier_vendeur delete parametres" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur delete parametres"
  on public.ref_supplier_vendeur for delete
  to authenticated
  using (public.current_role_has_permission('parametres.write'));
