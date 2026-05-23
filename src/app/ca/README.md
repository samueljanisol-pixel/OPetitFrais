# Chiffre d'affaires (tableau de bord)

Page du CA du jour sélectionné, avec comparaisons, détail par magasin et TOP 10 produits.

## Jour record

La carte **Total global** affiche un bandeau de félicitations (`RecordCaBanner`) et une animation de feux d'artifice en arrière-plan (`FireworksOverlay`) lorsque le CA du jour atteint ou dépasse le record historique (depuis `HISTORIQUE_FROM_ISO` dans `src/lib/ca/constants.ts`).

L'animation respecte `prefers-reduced-motion` (désactivée si l'utilisateur préfère moins d'animations).

La détection est calculée côté Supabase dans `fetchCaDashboardFromSupabase` (`isRecordDay` sur `CaResponse`), avec le même filtre magasin que le reste du tableau de bord (caissier limité à ses magasins).

## Données

- Source : `fetchCaDashboardFromSupabase` (tables `ca_day`, `ca_month`, `ca_panier_hour`, `ca_product_day`).
- Date sélectionnable via le champ date (max = aujourd'hui), avec boutons **J-1** / **J+1** de part et d'autre.
