-- Nom affiché par ligne de conditionnement produit (remplace le libellé réf. partout en UI).

alter table public.product_packaging
  add column if not exists nom text;

comment on column public.product_packaging.nom is
  'Nom personnalisé du conditionnement pour ce produit ; prioritaire sur ref_conditionnement.label à l''affichage.';
