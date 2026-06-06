# Catalogue produits

## Liste (`ProduitsListClient`)

- Filtre **Recherche (nom)** : insensible à la casse et aux accents (ex. « peche » trouve « Pêche »). Cherche aussi dans `name_ar`.
- **Import Google Sheet** : colonnes **Catégorie** + **Sous-Catégorie** (création auto de la sous-catégorie si absente sous la catégorie) ; **Marge DH Actuelle** → `product.margin`. Voir `src/features/sheet-import/`.
- **Sous-catégories** : table `ref_subcategory` (rattachée à `ref_category`), champ optionnel `product.subcategory_id`. Fiche produit + onglet Catégories dans **Paramètres**. Migration `20260701160000_ref_subcategory.sql`.

## Fiche produit (`ProductFormClient`)

- Query **`returnTo`** (chemin interne) : depuis le parcours commande, retour « Retour au parcours » et redirection après **Enregistrer** (`safeReturnPath` dans `src/lib/navigation/safe-return-path.ts`).
- Avec **`returnTo`** et permission **`commandes_fournisseur.saisie`** (sans `produits.write`) : fiche en lecture seule sur le produit, mais **conditionnements modifiables** (ajout, paramètres, archivage). La section conditionnements n’utilise pas de `fieldset disabled` (sinon les boutons ne reçoivent pas les clics).
- **Paramètres du conditionnement** : cases **vente / achat** juste au-dessus du tableau magasins ; si décochées, la colonne correspondante est grisée et non modifiable. Liste vendeurs vide : « Aucun vendeur ». **Créer un vendeur** : fenêtre avec choix du **fournisseur** (parmi ceux cochés pour le colis) et libellé.
- **Archivage** d’un conditionnement : dialogue MUI de confirmation (pas `window.confirm`). La ligne `product_packaging` est conservée (`archived_at` renseigné) pour l’historique commandes/lots ; elle disparaît du catalogue et de la saisie. Migration `20260627120000_product_packaging_archived.sql`.
- **Fournisseur** puis **Vendeur** (liste filtrée sur le fournisseur du produit, option « Aucun »).
- Le vendeur est enregistré sur `product.vendeur_id` (migration `20260621120000_product_vendeur_id.sql`).
- Changer de fournisseur réinitialise le vendeur s’il n’appartient plus au nouveau fournisseur.
- **Historique prix et marges** (`product_price_history`) : une ligne est ajoutée à chaque enregistrement qui modifie le prix de vente, un coût (achat, fabrication, emballage) ou la marge. La **marge n’est stockée que si elle est saisie** (fiche, import Sheet, marge rétroactive) — jamais calculée automatiquement à partir du prix de vente. Migration nettoyage : `20260701140000_clear_auto_price_history_margin.sql`.
- **Marge rétroactive** : bouton sur la fiche produit pour enregistrer une marge (ex. marge moyenne) **à partir d’une date passée** (`valid_from`, min = `HISTORIQUE_FROM_ISO` dans `src/lib/ca/constants.ts`) sans modifier le produit courant — permet d’estimer le bénéfice sur l’historique des ventes.

Les vendeurs se créent dans **Paramètres → Vendeurs**. Les liaisons par conditionnement restent dans **Paramètres du conditionnement** (`product_packaging_vendeur`).

## Conditionnements (`product_packaging`)

- Colonne **`nom`** (texte optionnel) : nom affiché pour ce colis sur **ce** produit. S’il est renseigné, il remplace le libellé du référentiel `ref_conditionnement` partout (saisie, récap, consolidation, achat, export vendeur, parcours).
- Colonne **`nom_ar`** (texte optionnel) : nom arabe affiché ; prioritaire sur `ref_conditionnement.label_ar`. Saisie dans **Paramètres du conditionnement** ou à l’ajout d’un colis.
- **Unicité** : une seule ligne **active** par triplet `(produit, type conditionnement réf., unité de vente)` (`archived_at` null). Un conditionnement archivé peut être recréé avec le même triplet.
- Saisie à l’**ajout** d’un conditionnement (fenêtre **Ajouter un conditionnement**) ou dans **Paramètres** du conditionnement (dialogue).
- Logique centralisée : `packagingConditionnementLabel` / `buildPackagingCondTitre` dans `src/lib/commandes-fournisseur/product-display.ts`.
- Migration : `20260624120000_product_packaging_nom.sql`, `20260630210000_product_packaging_nom_ar.sql`.
