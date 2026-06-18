-- Nom affiché client (vente) distinct du nom logistique (name / name_ar).

alter table public.product
  add column if not exists sales_name text,
  add column if not exists sales_name_ar text;

comment on column public.product.name is
  'Nom logistique (français) — usage interne, commandes, référentiel.';

comment on column public.product.name_ar is
  'Nom logistique (arabe) — usage interne.';

comment on column public.product.sales_name is
  'Nom de vente affiché au client (français) ; si null, repli sur name.';

comment on column public.product.sales_name_ar is
  'Nom de vente affiché au client (arabe) ; si null, repli sur name_ar puis sales_name.';
