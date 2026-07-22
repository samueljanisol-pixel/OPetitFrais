# Catalogue produits

## Liste (`ProduitsListClient`)

- Filtre **Recherche (nom)** : insensible à la casse et aux accents (ex. « peche » trouve « Pêche »). Cherche aussi dans `name_ar`.
- **Import Google Sheet** : colonnes **Nom** / **Arabe** → `product.name` / `product.name_ar` (format feuille inchangé) ; **Catégorie** + **SousCatégorie** (création auto de la sous-catégorie si absente sous la catégorie) ; **Marge DH Actuelle** → `product.margin` ; **Marchand** → `product.vendeur_id` (libellé vendeur du fournisseur de la ligne, créé en base s’il manque). Les noms de vente (`sales_name`) ne sont pas importés depuis la feuille. Voir `src/features/sheet-import/`.
- **Sous-catégories** : table `ref_subcategory` (rattachée à `ref_category`), champ optionnel `product.subcategory_id`. Fiche produit + onglet Catégories dans **Paramètres**. Migration `20260701160000_ref_subcategory.sql`.
- **Libellés arabes** : colonnes `label_ar` sur `ref_category` et `ref_subcategory` (Paramètres → Catégories). Migration `20260702130000_ref_category_subcategory_label_ar.sql`.

## Fiche produit (`ProductFormClient`)

- **Fournisseurs** : cases à cocher (comme pour les conditionnements) ; table `product_supplier`. Le premier coché selon l’ordre référentiel devient `product.supplier_id` (fournisseur principal). Migration `20260702160000_product_supplier.sql`.
- **Noms** : `name` / `name_ar` = **nom logistique** (interne, commandes fournisseur) ; `sales_name` / `sales_name_ar` = **nom de vente** affiché client (cuisine, boutique `opetitfrais.ma`, locale UI). Migration `20260702140000_product_sales_name.sql`.
- **Visible vitrine** : si coché (et produit actif), le produit apparaît sur la boutique publique [`/shop`](../shop/README.md) (`opetitfrais.ma`). Champ `product.visible_vitrine`.

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

## Photos terrain (`/produits/photo`)

Page mobile pour photographier les produits (PWA ou navigateur) :

- Sélection d’un produit (recherche nom/code), **prise de photo** ou **galerie**.
- Détourage optionnel : modèle IA `@imgly/background-removal` (~40 Mo), activable par appareil (`localStorage`). En-têtes COOP/COEP `credentialless` sur cette route (`next.config.ts`). Vignettes via `ProductPhotoThumb` (téléchargement Supabase → blob URL, compatible COEP).
- **Format final** : JPEG **100×100 px**, fond blanc, ratio conservé (`src/lib/products/photo-normalize.ts`).
- Prévisualisation et validation avant enregistrement ; **rotation** (90° gauche/droite) dans le dialogue de validation.
- Liste produits : vignette 44×44, filtre **Sans photo** / **Avec photo**.
- Après détourage : recadrage sur le sujet visible, **agrandissement** pour remplir le cadre avec ~3 % de marge, centrage dans le carré 100×100 (`photo-normalize.ts`).
- Export FTP : jauge de progression (%).
- Lien depuis la liste produits (**Photos terrain**) et la fiche produit (`?productId=`).

### Export / import FTP (`Photos_Produits.zip`)

- Archive FTP : `img_produits/Photos_Produits.zip` (remplace l’ancien `.rar`).
- Fichiers nommés par code numérique (`12.jpg` pour le code `000012`).
- **Export** : bouton sur la page photo ou liste produits — ZIP créé sur l’appareil (JSZip, recommandé mobile) ou sur le serveur (`POST /api/products/export-photos-ftp`).
- **Import** : `POST /api/products/import-photos-ftp` (SSE), extraction ZIP via `unzipper`.

## Conditionnements (`product_packaging`)

- Colonne **`nom`** (texte optionnel) : nom affiché pour ce colis sur **ce** produit. S’il est renseigné, il remplace le libellé du référentiel `ref_conditionnement` partout (saisie, récap, consolidation, achat, export vendeur, parcours).
- Colonne **`nom_ar`** (texte optionnel) : nom arabe affiché ; prioritaire sur `ref_conditionnement.label_ar`. Saisie dans **Paramètres du conditionnement** ou à l’ajout d’un colis.
- **Unicité** : une seule ligne **active** par triplet `(produit, type conditionnement réf., unité de vente)` (`archived_at` null). Un conditionnement archivé peut être recréé avec le même triplet.
- Saisie à l’**ajout** d’un conditionnement (fenêtre **Ajouter un conditionnement**) ou dans **Paramètres** du conditionnement (dialogue).
- Logique centralisée : `packagingConditionnementLabel` / `buildPackagingCondTitre` dans `src/lib/commandes-fournisseur/product-display.ts`.
- Migration : `20260624120000_product_packaging_nom.sql`, `20260630210000_product_packaging_nom_ar.sql`.
