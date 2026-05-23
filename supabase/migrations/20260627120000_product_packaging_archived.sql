-- Archivage logique des conditionnements (plus de DELETE : évite SET NULL sur lignes commande/lot).

alter table public.product_packaging
  add column if not exists archived_at timestamptz;

comment on column public.product_packaging.archived_at is
  'Archivage : masqué du catalogue et de la saisie ; la ligne reste pour l’historique commandes/lots.';

-- Unicité (produit, type cond., UdV) uniquement sur les conditionnements actifs.
alter table public.product_packaging
  drop constraint if exists product_packaging_product_id_conditionnement_id_sales_unit_id_key;

alter table public.product_packaging
  drop constraint if exists product_packaging_product_id_conditionnement_id_sales_unit__key;

drop index if exists public.product_packaging_product_cond_unit_active_uniq;

create unique index product_packaging_product_cond_unit_active_uniq
  on public.product_packaging (product_id, conditionnement_id, sales_unit_id)
  where archived_at is null;

create index if not exists idx_product_packaging_active_by_product
  on public.product_packaging (product_id)
  where archived_at is null;
