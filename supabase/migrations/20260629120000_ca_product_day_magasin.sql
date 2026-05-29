-- Ventes produit par magasin (filtres TOP 10 CA dashboard)

alter table public.ca_product_day
  add column if not exists magasin text;

update public.ca_product_day
set magasin = '__all__'
where magasin is null;

alter table public.ca_product_day
  alter column magasin set not null;

alter table public.ca_product_day
  drop constraint if exists ca_product_day_pkey;

alter table public.ca_product_day
  add primary key (date, magasin, article);

create index if not exists idx_ca_product_day_date_mag
  on public.ca_product_day (date, magasin);

comment on column public.ca_product_day.magasin is
  'Code magasin (ex. M1). Valeur __all__ = agrégat legacy avant ventil par magasin ; resync jour recommandé.';
