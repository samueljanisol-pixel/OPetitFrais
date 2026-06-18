-- Libellé arabe optionnel pour les unités de vente.

alter table public.ref_sales_unit
  add column if not exists label_ar text;

comment on column public.ref_sales_unit.label_ar is
  'Libellé arabe de l’unité de vente (affichage RTL, optionnel).';
