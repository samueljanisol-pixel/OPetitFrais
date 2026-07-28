-- File d'attente « Actualisation produit » : prix (clôture vendeur) + désactivation (clôture lot).

create table if not exists public.product_actualisation_prix (
  product_id uuid primary key references public.product (id) on delete cascade,
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  supplier_id uuid not null references public.ref_supplier (id) on delete cascade,
  new_cost_purchase numeric(14, 4) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_actualisation_prix_lot
  on public.product_actualisation_prix (lot_id);

create index if not exists idx_product_actualisation_prix_supplier
  on public.product_actualisation_prix (supplier_id);

create index if not exists idx_product_actualisation_prix_created
  on public.product_actualisation_prix (created_at desc);

comment on table public.product_actualisation_prix is
  'Produits à actualiser (prix / réactivation) après clôture vendeur achat.';

create table if not exists public.product_actualisation_desactivation (
  product_id uuid primary key references public.product (id) on delete cascade,
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  supplier_id uuid not null references public.ref_supplier (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_actualisation_desactivation_lot
  on public.product_actualisation_desactivation (lot_id);

create index if not exists idx_product_actualisation_desactivation_supplier
  on public.product_actualisation_desactivation (supplier_id);

create index if not exists idx_product_actualisation_desactivation_created
  on public.product_actualisation_desactivation (created_at desc);

comment on table public.product_actualisation_desactivation is
  'Produits actifs+vitrine non commandés à proposer en désactivation (clôture lot).';

alter table public.product_actualisation_prix enable row level security;
alter table public.product_actualisation_desactivation enable row level security;

drop policy if exists "product_actualisation_prix select" on public.product_actualisation_prix;
create policy "product_actualisation_prix select"
  on public.product_actualisation_prix for select
  to authenticated
  using (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "product_actualisation_prix write" on public.product_actualisation_prix;
create policy "product_actualisation_prix write"
  on public.product_actualisation_prix for all
  to authenticated
  using (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  )
  with check (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "product_actualisation_desactivation select" on public.product_actualisation_desactivation;
create policy "product_actualisation_desactivation select"
  on public.product_actualisation_desactivation for select
  to authenticated
  using (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "product_actualisation_desactivation write" on public.product_actualisation_desactivation;
create policy "product_actualisation_desactivation write"
  on public.product_actualisation_desactivation for all
  to authenticated
  using (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  )
  with check (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

grant select, insert, update, delete on public.product_actualisation_prix to authenticated;
grant select, insert, update, delete on public.product_actualisation_desactivation to authenticated;
