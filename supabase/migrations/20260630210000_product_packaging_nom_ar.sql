-- Nom affiché arabe par ligne de conditionnement produit (prioritaire sur ref_conditionnement.label_ar).

alter table public.product_packaging
  add column if not exists nom_ar text;

comment on column public.product_packaging.nom_ar is
  'Nom arabe personnalisé du conditionnement pour ce produit ; prioritaire sur ref_conditionnement.label_ar à l''affichage.';
