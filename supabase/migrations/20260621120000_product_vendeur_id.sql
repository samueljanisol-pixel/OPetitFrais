-- Vendeur par défaut au niveau produit (fournisseur du produit).

alter table public.product
  add column if not exists vendeur_id uuid references public.ref_supplier_vendeur (id) on delete set null;

create index if not exists idx_product_vendeur on public.product (vendeur_id);

comment on column public.product.vendeur_id is
  'Vendeur achat par défaut pour ce produit (doit appartenir au fournisseur du produit).';
