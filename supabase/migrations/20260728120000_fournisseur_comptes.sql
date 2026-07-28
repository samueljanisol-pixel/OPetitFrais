-- Comptes fournisseurs : modes de paiement, achats comptables, paiements

insert into public.permissions (key, description, module, sort_order) values
  ('commandes_fournisseur.comptes', 'Gérer les comptes et paiements fournisseurs', 'commandes_fournisseur', 93)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'acheteur'
  and p.key = 'commandes_fournisseur.comptes'
on conflict do nothing;

-- Modes de paiement
create table if not exists public.ref_payment_method (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  label_ar text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.ref_payment_method is
  'Modes de paiement fournisseurs (espèce, virement, etc.).';

alter table public.ref_payment_method enable row level security;

drop policy if exists "all authenticated ref_payment_method" on public.ref_payment_method;
create policy "all authenticated ref_payment_method"
  on public.ref_payment_method for all to authenticated using (true) with check (true);

drop trigger if exists trg_ref_payment_method_code on public.ref_payment_method;
create trigger trg_ref_payment_method_code
  before insert on public.ref_payment_method
  for each row
  execute function public.ref_row_set_code();

insert into public.ref_payment_method (label, sort_order)
select v.label, v.sort_order
from (values
  ('Espèce', 1),
  ('Virement Bancaire', 2),
  ('Transfert Wafacash', 3)
) as v(label, sort_order)
where not exists (select 1 from public.ref_payment_method limit 1);

-- Achats comptables (générés à la clôture lot)
create table if not exists public.fournisseur_compte_achat (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  supplier_id uuid not null references public.ref_supplier (id) on delete restrict,
  vendeur_id uuid references public.ref_supplier_vendeur (id) on delete set null,
  kind text not null check (kind in ('station', 'vendeur', 'frais_generaux')),
  montant_total numeric(14, 2) not null check (montant_total >= 0),
  date_cloture timestamptz not null,
  created_at timestamptz not null default now(),
  constraint fournisseur_compte_achat_kind_vendeur check (
    (kind = 'vendeur' and vendeur_id is not null)
    or (kind in ('station', 'frais_generaux') and vendeur_id is null)
  )
);

create unique index if not exists idx_fca_lot_station
  on public.fournisseur_compte_achat (lot_id)
  where kind = 'station';

create unique index if not exists idx_fca_lot_vendeur
  on public.fournisseur_compte_achat (lot_id, vendeur_id)
  where kind = 'vendeur';

create unique index if not exists idx_fca_lot_frais_generaux
  on public.fournisseur_compte_achat (lot_id)
  where kind = 'frais_generaux';

create index if not exists idx_fca_supplier_date on public.fournisseur_compte_achat (supplier_id, date_cloture desc);
create index if not exists idx_fca_lot on public.fournisseur_compte_achat (lot_id);

comment on table public.fournisseur_compte_achat is
  'Écriture comptable fournisseur à la clôture d''un lot achat (station, vendeur marché, ou frais généraux).';

-- Paiements fournisseurs
create table if not exists public.fournisseur_paiement (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.ref_supplier (id) on delete restrict,
  payment_method_id uuid not null references public.ref_payment_method (id) on delete restrict,
  date_paiement date not null,
  commentaire text,
  montant numeric(14, 2) not null check (montant > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fp_supplier_date on public.fournisseur_paiement (supplier_id, date_paiement desc);

create table if not exists public.fournisseur_paiement_achat (
  paiement_id uuid not null references public.fournisseur_paiement (id) on delete cascade,
  achat_id uuid not null references public.fournisseur_compte_achat (id) on delete restrict,
  primary key (paiement_id, achat_id),
  unique (achat_id)
);

comment on table public.fournisseur_paiement_achat is
  'Lien paiement ↔ achats comptables ; un achat ne peut être payé qu''une fois.';

-- RLS comptes
alter table public.fournisseur_compte_achat enable row level security;
alter table public.fournisseur_paiement enable row level security;
alter table public.fournisseur_paiement_achat enable row level security;

drop policy if exists "fca select comptes" on public.fournisseur_compte_achat;
create policy "fca select comptes"
  on public.fournisseur_compte_achat for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'));

drop policy if exists "fca write comptes" on public.fournisseur_compte_achat;
create policy "fca write comptes"
  on public.fournisseur_compte_achat for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'))
  with check (public.current_role_has_permission('commandes_fournisseur.comptes'));

drop policy if exists "fp select comptes" on public.fournisseur_paiement;
create policy "fp select comptes"
  on public.fournisseur_paiement for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'));

drop policy if exists "fp write comptes" on public.fournisseur_paiement;
create policy "fp write comptes"
  on public.fournisseur_paiement for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'))
  with check (public.current_role_has_permission('commandes_fournisseur.comptes'));

drop policy if exists "fpa select comptes" on public.fournisseur_paiement_achat;
create policy "fpa select comptes"
  on public.fournisseur_paiement_achat for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'));

drop policy if exists "fpa write comptes" on public.fournisseur_paiement_achat;
create policy "fpa write comptes"
  on public.fournisseur_paiement_achat for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'))
  with check (public.current_role_has_permission('commandes_fournisseur.comptes'));
