-- File « À activer » : produits inactifs achetés sans changement de prix de vente proposé.

create table if not exists public.product_actualisation_activation (
  product_id uuid primary key references public.product (id) on delete cascade,
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  supplier_id uuid not null references public.ref_supplier (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_actualisation_activation_lot
  on public.product_actualisation_activation (lot_id);

create index if not exists idx_product_actualisation_activation_supplier
  on public.product_actualisation_activation (supplier_id);

create index if not exists idx_product_actualisation_activation_created
  on public.product_actualisation_activation (created_at desc);

comment on table public.product_actualisation_activation is
  'Produits inactifs achetés sans écart prix actuel / prix proposé (clôture vendeur).';

comment on table public.product_actualisation_prix is
  'Produits à actualiser (prix de vente) après clôture vendeur — uniquement si prix actuel ≠ prix proposé.';

alter table public.product_actualisation_activation enable row level security;

drop policy if exists "product_actualisation_activation select" on public.product_actualisation_activation;
create policy "product_actualisation_activation select"
  on public.product_actualisation_activation for select
  to authenticated
  using (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "product_actualisation_activation write" on public.product_actualisation_activation;
create policy "product_actualisation_activation write"
  on public.product_actualisation_activation for all
  to authenticated
  using (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  )
  with check (
    public.current_role_has_permission('produits.write')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

grant select, insert, update, delete on public.product_actualisation_activation to authenticated;
