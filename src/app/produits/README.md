# Catalogue produits

## Actualisation produit (`/produits/actualisation`)

File d’attente après achat fournisseur (menu accueil + badge) :

- **Prix à actualiser** (`product_actualisation_prix`) : à la **clôture vendeur**, uniquement si le **prix actuel ≠ prix proposé** (`cost_purchase + fabrication + emballage + marge`, arrondi au **0,5 supérieur**). Validation : `price` / `marge` / `visible_vitrine`, réactive si besoin, historique prix, retire de la file.
- **À activer** (`product_actualisation_activation`) : produit **inactif** acheté **sans** écart de prix proposé. Switches Actif (défaut on) / Vitrine (défaut off).
- **À désactiver** (`product_actualisation_desactivation`) : à la **clôture lot**, produits fournisseur `active` + `visible_vitrine` sans ligne ou `qte_achat = 0`, **sans achat (`qte_achat > 0`) depuis plus de 5 jours** (dernière clôture lot terminée, ou `product.created_at` si jamais commandé). Priorité : prix > activation > désactivation.
- **Sélection** : cases à cocher + **Valider la sélection** / **Ne rien faire** (retire de la file sans modifier le produit) en barre d’outils ou **par ligne** (colonne Actions). Icône édition → fiche produit (`returnTo` = cette page).
- Formule prix proposé : coûts + marge, **arrondi au 0,5 supérieur** (`roundSalePriceUpToHalf`). Éditer la marge recalcule le prix ; éditer le prix = mode manuel.
- Permissions : `produits.write` **ou** `commandes_fournisseur.achat`. APIs : `GET /api/produits/actualisation`, `GET …/count`, `POST …/prix|activation|desactivation/validate`, `POST …/dismiss`.
- Migrations : `20260728230000_product_actualisation.sql`, `20260728231000_product_actualisation_activation.sql`. Helpers : `src/lib/products/actualisation.ts`.

## Liste (`ProduitsListClient`)

- **Colonnes configurables** : bouton **Colonnes** → choix des champs affichés, option **Éditable** par colonne (lecture seule dans la liste si décochée), réordonnancement, préférence en `localStorage` (`produits.list.columns`). Colonnes par défaut (bouton **Colonnes par défaut**) : Code, Actif, Nom logistique (lecture seule par défaut), Prix, UdV, Fournisseur, Catégorie, Fiche ; les autres colonnes éditables du registre restent modifiables inline par défaut. Groupe **Boutique** : UdV boutique, **unités cmd. boutique** (cases par unité vitrine), **poids pièce (kg)**, **favori boutique**.
- **Édition inline** : colonnes éditables — texte/nombre (commit au blur ou Entrée), switches, listes et **unités cmd. boutique** (commit immédiat). Ligne en orange si brouillon non enregistré, bouton ↺ pour annuler.
- **Modification groupée** : sélection par cases à cocher → **Modifier la sélection…** (FormDialog : un champ, une valeur pour tous) ou menu **Actions groupées** (Activer / Désactiver).
- Effets de bord alignés fiche produit : historique prix si prix/coûts/marge changent ; reset vendeur si fournisseur incompatible ; reset sous-catégorie si catégorie incompatible ; sync `product_supplier` si fournisseur principal modifié.
- Helpers : `src/lib/products/product-list-columns.ts`, `product-list-column-preference.ts`, `product-field-commit.ts`. Composants : `ProductListCell`, `ProductListColumnPicker`, `ProductListBulkEditDialog`.
- **Hors liste** (fiche produit uniquement) : conditionnements (`product_packaging`), fournisseurs multiples (cases à cocher).
- Colonne **Actif** : switch par ligne (permission `produits.write`) qui met à jour `product.active` immédiatement. Avec le filtre « Actifs », une désactivation retire la ligne de la liste.
- Filtre **Actif** : par défaut **Tous** (actifs et inactifs).
- Tri par défaut : **Nom** croissant.
- Filtre **Recherche (nom)** : insensible à la casse et aux accents (ex. « peche » trouve « Pêche »). Cherche aussi dans `name_ar`.
- **Import Google Sheet** : colonnes **Nom** / **Arabe** → `product.name` / `product.name_ar` ; **UdV** → `sales_unit_id` ; **UdC** → `order_unit_id` ; **UdA** → `purchase_unit_id` ; **Catégorie** + **SousCatégorie** ; **Marge DH Actuelle** → `product.margin` ; **Marchand** → `product.vendeur_id`. Voir `src/features/sheet-import/`.
- **Export JSON (BDD)** : `GET /api/transition/sheet-json-export?token=…` — clés `code`, `Actif`, `Nom`, `Prix`, `PrixAchat`, `Fournisseur`, `Catégorie`, `SousCatégorie`, `Arabe`, `UdV`. **Exclus** : produits catégorie/fournisseur `emballages_consommables` (miroirs sync emballages). Token : `SHEET_JSON_EXPORT_TOKEN` + `NEXT_PUBLIC_SHEET_JSON_EXPORT_TOKEN` (pas besoin d’être connecté).
- **Date dernière modif** : `GET /api/transition/sheet-json-export?format=date&token=…` → `{ "lastModified": "YYYYMMDDHHmmss" }` (comme le [script Google `?format=date`](https://script.google.com/macros/s/AKfycbyUwUcDK6FrQW6wzg2MBnunvElNp1MSyH_aw_yQ8E5r3a938l-tmdBmQTOuhNVZYfeS/exec?format=date)).
- **Sous-catégories** : table `ref_subcategory` (rattachée à `ref_category`), champ optionnel `product.subcategory_id`. Fiche produit + onglet Catégories dans **Paramètres**. Migration `20260701160000_ref_subcategory.sql`.
- **Libellés arabes** : colonnes `label_ar` sur `ref_category` et `ref_subcategory` (Paramètres → Catégories). Migration `20260702130000_ref_category_subcategory_label_ar.sql`.

## Fiche produit (`ProductFormClient`)

- **Fournisseurs** : cases à cocher (comme pour les conditionnements) ; table `product_supplier`. Le premier coché selon l’ordre référentiel devient `product.supplier_id` (fournisseur principal). Import en masse « Marché » depuis l’Excel unités : `npx tsx scripts/apply-marche-supplier-from-excel.ts [fichier.xlsx]`.
- **Noms** : `name` / `name_ar` = **nom logistique** (interne, commandes fournisseur) ; `sales_name` / `sales_name_ar` = **nom de vente** affiché client (cuisine, boutique `opetitfrais.ma`, locale UI). Migration `20260702140000_product_sales_name.sql`.
- **Visible vitrine** : si coché (et produit actif), le produit apparaît sur la boutique publique [`/shop`](../shop/README.md) (`opetitfrais.ma`). Champ `product.visible_vitrine`.
- **Unités de commande boutique** : section sur la fiche — **poids d’une pièce (kg)** (optionnel) ; liste avec **UdV** en 1re ligne (décochable) puis unités du référentiel Paramètres ; **favori** (radio, défaut = UdV). Au moins une option cochée pour enregistrer. Tables `product.piece_weight_kg`, `shop_allow_sales_unit`, `shop_favorite_unit_id`, `product_shop_order_unit`. Migration `20260727160000_shop_order_unit.sql`.

- Query **`returnTo`** (chemin interne) : depuis le parcours commande, retour « Retour au parcours » et redirection après **Enregistrer** (`safeReturnPath` dans `src/lib/navigation/safe-return-path.ts`).
- Avec **`returnTo`** et permission **`commandes_fournisseur.saisie`** (sans `produits.write`) : fiche en lecture seule sur le produit, mais **conditionnements modifiables** (ajout, paramètres, archivage). La section conditionnements n’utilise pas de `fieldset disabled` (sinon les boutons ne reçoivent pas les clics).
- **Paramètres du conditionnement** : cases **vente / achat** juste au-dessus du tableau magasins ; si décochées, la colonne correspondante est grisée et non modifiable. Liste vendeurs vide : « Aucun vendeur ». **Créer un vendeur** : fenêtre avec choix du **fournisseur** (parmi ceux cochés pour le colis) et libellé.
- **Archivage** d’un conditionnement : dialogue MUI de confirmation (pas `window.confirm`). La ligne `product_packaging` est conservée (`archived_at` renseigné) pour l’historique commandes/lots ; elle disparaît du catalogue et de la saisie. Migration `20260627120000_product_packaging_archived.sql`.
- **Fournisseur** puis **Vendeur** (liste filtrée sur le fournisseur du produit, option « Aucun »).
- **Unité de commande (UdC)** : optionnelle, distincte de l’UdV ; référentiel **Paramètres → Unités de commande**. Import en masse depuis un Excel « Unité de commande » : `npx tsx scripts/apply-order-units-from-excel.ts [fichier.xlsx]` (colonne **Unité d'Achat** → `product.order_unit_id`).
- **Unité d'achat (UdA)** : optionnelle, distincte de l’UdV et de l’UdC ; référentiel **Paramètres → Unités d'achat**. Backfill des UdA manquantes : **Kg** si UdV = Kg, **Pièce** si UdV = Unité / Unité(s) (`20260727120000_backfill_product_purchase_unit.sql`).
- Le vendeur est enregistré sur `product.vendeur_id` (migration `20260621120000_product_vendeur_id.sql`).
- Changer de fournisseur réinitialise le vendeur s’il n’appartient plus au nouveau fournisseur.
- **Historique prix et marges** (`product_price_history`) : une ligne est ajoutée à chaque enregistrement qui modifie le prix de vente, un coût (achat, fabrication, emballage) ou la marge. La **marge n’est stockée que si elle est saisie** (fiche, import Sheet, marge rétroactive) — jamais calculée automatiquement à partir du prix de vente. Migration nettoyage : `20260701140000_clear_auto_price_history_margin.sql`.
- **Marge rétroactive** : bouton sur la fiche produit pour enregistrer une marge (ex. marge moyenne) **à partir d’une date passée** (`valid_from`, min = `HISTORIQUE_FROM_ISO` dans `src/lib/ca/constants.ts`) sans modifier le produit courant — permet d’estimer le bénéfice sur l’historique des ventes.
- **Emballage utilisé** : liste déroulante optionnelle (`product.emballage_id` → article catégorie **emballages**). Distinct du **Prix emballage** (`cost_packaging`) et des conditionnements colis.
- **Étiquette** : liste déroulante optionnelle (`product.etiquette_id` → article catégorie **étiquettes**, défaut aucune). Géré dans **Emballages et Consommables** (`/emballages`). Migrations `20260728160000_gestion_emballages.sql`, `20260728240000_emballages_consommables_extension.sql`.

### Produits miroir emballages (sync auto)

Les articles du référentiel `/emballages` génèrent automatiquement un **produit commandable** (`ref_emballage.product_id` → `product`) : catégorie **Emballages et consommables**, commande à l’unité, non visible vitrine. Ces produits ne se créent pas manuellement sur la fiche produit — ils sont synchronisés à chaque création/modification d’article emballage (`src/lib/emballages/sync-product-mirror.ts`). Distinct des liens BOM `product.emballage_id` / `product.etiquette_id` sur les produits alimentaires.

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
