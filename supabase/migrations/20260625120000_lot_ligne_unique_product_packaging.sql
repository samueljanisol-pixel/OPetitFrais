-- Plusieurs lignes de lot pour le même produit si les conditionnements diffèrent.
-- Remplace unique (lot_id, product_id) par (lot_id, product_id, conditionnement).

alter table public.commande_fournisseur_lot_ligne
  drop constraint if exists commande_fournisseur_lot_ligne_lot_id_product_id_key;

drop index if exists public.commande_fournisseur_lot_ligne_lot_product_pack_uniq;

create unique index commande_fournisseur_lot_ligne_lot_product_pack_uniq
  on public.commande_fournisseur_lot_ligne (
    lot_id,
    product_id,
    coalesce(product_packaging_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

comment on index public.commande_fournisseur_lot_ligne_lot_product_pack_uniq is
  'Une ligne de lot par couple (produit, conditionnement) ; null = à l’unité.';
