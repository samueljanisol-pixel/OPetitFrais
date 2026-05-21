# Catalogue produits

## Fiche produit (`ProductFormClient`)

- **Fournisseur** puis **Vendeur** (liste filtrée sur le fournisseur du produit, option « Aucun »).
- Le vendeur est enregistré sur `product.vendeur_id` (migration `20260621120000_product_vendeur_id.sql`).
- Changer de fournisseur réinitialise le vendeur s’il n’appartient plus au nouveau fournisseur.

Les vendeurs se créent dans **Paramètres → Vendeurs**. Les liaisons par conditionnement restent dans **Paramètres du conditionnement** (`product_packaging_vendeur`).

## Conditionnements (`product_packaging`)

- Colonne **`nom`** (texte optionnel) : nom affiché pour ce colis sur **ce** produit. S’il est renseigné, il remplace le libellé du référentiel `ref_conditionnement` partout (saisie, récap, consolidation, achat, export vendeur, parcours).
- **Unicité** : une seule ligne par triplet `(produit, type conditionnement réf., unité de vente)`. Pour un second « nom » ou une autre qté sur le même colis, modifier la ligne existante (**Paramètres**), pas en ajouter une nouvelle.
- Saisie à l’**ajout** d’un conditionnement ou dans **Paramètres** du conditionnement (dialogue).
- Logique centralisée : `packagingConditionnementLabel` / `buildPackagingCondTitre` dans `src/lib/commandes-fournisseur/product-display.ts`.
- Migration : `20260624120000_product_packaging_nom.sql`.
