-- Lier les ventes caisse (ca_product_day) au catalogue product via product_id

alter table public.ca_product_day
  add column if not exists product_id uuid references public.product (id) on delete set null;

create index if not exists idx_ca_product_day_product_id
  on public.ca_product_day (product_id)
  where product_id is not null;

comment on column public.ca_product_day.product_id is
  'Produit catalogue ; rapprochement par code produit uniquement.';

-- Backfill : libellé caisse = code produit (padding 6 chiffres si numérique)
update public.ca_product_day cpd
set product_id = p.id
from public.product p
where cpd.product_id is null
  and (
    lower(trim(p.code)) = lower(trim(cpd.article))
    or p.code = lpad(regexp_replace(trim(cpd.article), '[^0-9]', '', 'g'), 6, '0')
  );
