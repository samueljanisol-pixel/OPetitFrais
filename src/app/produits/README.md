# Catalogue produits

## Fiche produit (`ProductFormClient`)

- Query **`returnTo`** (chemin interne) : depuis le parcours commande, retour « Retour au parcours » et redirection après **Enregistrer** (`safeReturnPath` dans `src/lib/navigation/safe-return-path.ts`).
- Avec **`returnTo`** et permission **`commandes_fournisseur.saisie`** (sans `produits.write`) : fiche en lecture seule sur le produit, mais **conditionnements modifiables** (ajout, paramètres, archivage). La section conditionnements n’utilise pas de `fieldset disabled` (sinon les boutons ne reçoivent pas les clics).
- **Archivage** d’un conditionnement : dialogue MUI de confirmation (pas `window.confirm`). La ligne `product_packaging` est conservée (`archived_at` renseigné) pour l’historique commandes/lots ; elle disparaît du catalogue et de la saisie. Migration `20260627120000_product_packaging_archived.sql`.
- **Fournisseur** puis **Vendeur** (liste filtrée sur le fournisseur du produit, option « Aucun »).
- Le vendeur est enregistré sur `product.vendeur_id` (migration `20260621120000_product_vendeur_id.sql`).
- Changer de fournisseur réinitialise le vendeur s’il n’appartient plus au nouveau fournisseur.

Les vendeurs se créent dans **Paramètres → Vendeurs**. Les liaisons par conditionnement restent dans **Paramètres du conditionnement** (`product_packaging_vendeur`).

## Conditionnements (`product_packaging`)

- Colonne **`nom`** (texte optionnel) : nom affiché pour ce colis sur **ce** produit. S’il est renseigné, il remplace le libellé du référentiel `ref_conditionnement` partout (saisie, récap, consolidation, achat, export vendeur, parcours).
- **Unicité** : une seule ligne **active** par triplet `(produit, type conditionnement réf., unité de vente)` (`archived_at` null). Un conditionnement archivé peut être recréé avec le même triplet.
- Saisie à l’**ajout** d’un conditionnement ou dans **Paramètres** du conditionnement (dialogue).
- Logique centralisée : `packagingConditionnementLabel` / `buildPackagingCondTitre` dans `src/lib/commandes-fournisseur/product-display.ts`.
- Migration : `20260624120000_product_packaging_nom.sql`.
