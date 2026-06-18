-- Fournisseurs multiples par produit (comme product_packaging_supplier pour les colis).

create table if not exists public.product_supplier (
  product_id uuid not null references public.product (id) on delete cascade,
  supplier_id uuid not null references public.ref_supplier (id) on delete restrict,
  primary key (product_id, supplier_id)
);

create index if not exists product_supplier_supplier_id_idx
  on public.product_supplier (supplier_id);

alter table public.product_supplier enable row level security;

drop policy if exists "all authenticated product_supplier" on public.product_supplier;
create policy "all authenticated product_supplier"
  on public.product_supplier for all to authenticated using (true) with check (true);

insert into public.product_supplier (product_id, supplier_id)
select p.id, p.supplier_id
from public.product p
where p.supplier_id is not null
on conflict (product_id, supplier_id) do nothing;

comment on table public.product_supplier is
  'Fournisseurs éligibles pour ce produit (commandes, achat). product.supplier_id reste le fournisseur principal.';

comment on column public.product.supplier_id is
  'Fournisseur principal (affichage legacy, import Sheet) ; liste complète dans product_supplier.';
