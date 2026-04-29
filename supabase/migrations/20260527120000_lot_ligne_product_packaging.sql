-- Conditionnement retenu pour une ligne de lot (affichage « Soit », cohérent avec la saisie commande).
-- NULL = achat exprimé à l’unité de vente (réf. produit) même si des conditionnements existent.

alter table public.commande_fournisseur_lot_ligne
  add column if not exists product_packaging_id uuid references public.product_packaging (id) on delete set null;

comment on column public.commande_fournisseur_lot_ligne.product_packaging_id is
  'Emballage / conditionnement pour la ligne de lot ; null = quantités à l’unité de vente référence produit.';

-- Anciennes lignes : aligner sur l’ancien rendu UI (premier conditionnement par produit).
update public.commande_fournisseur_lot_ligne ll
set product_packaging_id = fp.id
from (
  select distinct on (product_id)
    product_id,
    id
  from public.product_packaging
  order by product_id, created_at asc
) fp
where ll.product_id = fp.product_id
  and ll.product_packaging_id is null;
