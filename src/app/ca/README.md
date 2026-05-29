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

Filtres **Magasin** et **Catégorie** (liste issue du catalogue `product` / `ref_category`, rapprochée par nom d’article).

- Table `ca_product_day` : clé `(date, magasin, article)` — migration `20260629120000_ca_product_day_magasin.sql`.
- Sync FTP : ventes produit ventilées par magasin ; **relancer la sync** des jours concernés pour activer le filtre magasin (données legacy `__all__` = agrégat global).
- **Tous les magasins** : colonnes par magasin + **Total** dans les deux tableaux (CA et quantité).

## Données

- Source : `fetchCaDashboardFromSupabase` (tables `ca_day`, `ca_month`, `ca_panier_hour`, `ca_product_day`).
- Date sélectionnable via le champ date (max = aujourd'hui), avec boutons **J-1** / **J+1** de part et d'autre.
