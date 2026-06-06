-- Libellé arabe optionnel pour catégories et sous-catégories catalogue.

alter table public.ref_category
  add column if not exists label_ar text;

comment on column public.ref_category.label_ar is
  'Libellé arabe de la catégorie (affichage RTL, optionnel).';

alter table public.ref_subcategory
  add column if not exists label_ar text;

comment on column public.ref_subcategory.label_ar is
  'Libellé arabe de la sous-catégorie (affichage RTL, optionnel).';
