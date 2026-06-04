-- Libellé arabe optionnel pour les conditionnements référentiel.

alter table public.ref_conditionnement
  add column if not exists label_ar text;

comment on column public.ref_conditionnement.label_ar is
  'Libellé arabe du conditionnement (affichage RTL, optionnel).';
