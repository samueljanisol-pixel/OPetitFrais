# Chiffre d'affaires (tableau de bord)

Page du CA du jour sélectionné, avec comparaisons, détail par magasin et TOP 10 produits.

## Jour record

La carte **Total global** affiche un bandeau de félicitations (`RecordCaBanner`) et une animation de feux d'artifice en arrière-plan (`FireworksOverlay`) lorsque le CA du jour atteint ou dépasse le record historique (depuis `HISTORIQUE_FROM_ISO` dans `src/lib/ca/constants.ts`).

L'animation respecte `prefers-reduced-motion` (désactivée si l'utilisateur préfère moins d'animations). Elle se déclenche pour un record global **ou** un record magasin.

La détection est calculée côté Supabase dans `fetchCaDashboardFromSupabase` :
- `isRecordDay` / `previousRecordDay` (global)
- `isRecordDayByMag` / `previousRecordDayByMag` par code magasin

Chaque bandeau record affiche le **dernier record battu** (montant + date) lorsqu'un record antérieur existait.

## TOP 10 produits

Filtres **Magasin** et **Catégorie** (catalogue `product` via `ca_product_day.product_id`, lien **par code produit**).

- Table `ca_product_day` : clé `(date, magasin, article)` + `product_id` → `product` (migration `20260630120000_ca_product_day_product_id.sql`).
- Sync FTP : ventes produit ventilées par magasin ; `product_id` rempli à l’import (`src/lib/ca/productCatalogMatch.ts`). **Relancer la sync** des jours concernés après migration.
- **Tous les magasins** : colonnes par magasin + **Total** dans les deux tableaux (CA et quantité).
- Tableau **Par quantité** : colonne **UdV** (unité de vente catalogue, `ref_sales_unit` du produit lié).
- Tableau **Par CA** : colonne **Bénéfice** (qty × marge catalogue à la date, via `product_price_history`).

## Bénéfice estimé

Dans les cartes **Total global** (jour) et **Total du mois** :

- Formule : **qty × marge unitaire** à la date de vente (`product_price_history`), uniquement produits avec marge **explicitement** renseignée et `qty > 0`.
- Agrégat unique : `fetchBenefitTotalsForDateRange` (même moteur que `/historique-ca` et Analyse Stats sans filtres) — résolution produit = id DB, sinon code article catalogue, sinon UUID brut.
- Affichage : montant + **% du CA total** + **% du CA avec marge** (CA des seuls produits avec marge connue) ; colonne TOP 10 **Bénéfice** avec % du CA produit (enrichissement ligne à ligne, hors total carte).

## Charges & bénéfice net

Charges configurées dans **Paramètres → Charges Magasins** (`magasin_charge`, lib `src/lib/ca/magasinCharges.ts`) :

- **Jour** : charge `jour` = qté × prix ; charge `mois` = (qté × prix) ÷ jours du mois.
- **Mois** : charge `mois` = 1 × forfait (même mois incomplet) ; charge `jour` × jours de la période affichée.
- Charges **générales** (`magasin_id` null) : uniquement sur les totaux globaux.
- Affichage : **Charges** puis **Bénéfice net estimé** (= bénéfice − charges), global et par magasin (sans générales).

## TOP 10 catégories

Sous les tableaux produits : agrégation par **catégorie catalogue** (`ref_category` via `product`), avec le même filtre **Magasin** (pas le filtre catégorie produit).

- Calcul : `src/lib/ca/topCategories.ts` (`computeTopCategorieRankings`).
- **Tous les magasins** : vue pivot (colonnes magasin + total) pour le CA ; classements séparés par CA et par quantité (10 lignes max chacun).
- Produits sans catégorie regroupés sous **Sans catégorie**.

## Total kg

Dans les cartes **Total global** (jour) et **Total du mois** :

- Somme des **quantités** des lignes `ca_product_day` dont le produit catalogue a l’UdV **Kg** (`ref_sales_unit.code = kg`).
- Jour : lignes de la date sélectionnée (même règle anti double-comptage magasin / `__all__` que le TOP produits).
- Mois : agrégat sur tout le mois calendaire affiché (`src/lib/ca/totalKg.ts`).

## Données

- Source : `fetchCaDashboardFromSupabase` (tables `ca_day`, `ca_month`, `ca_panier_hour`, `ca_product_day`).
- Date sélectionnable via le champ date (max = aujourd'hui), avec boutons **J-1** / **J+1** de part et d'autre.
