# Analyse Stats

Page d’analyse des ventes produit sur une plage de dates, avec filtres et regroupements.

## Accès

- Route : `/analyse-stats`
- Permission : `ventes.read`
- Navigation : boutons **Analyse Stats** depuis **Statistique** (`/ca`) et **Historique** (`/historique-ca`)

## Données

| Source | Usage |
|--------|--------|
| `ca_product_day` via RPC `ca_analyse_product_lines` | Ventes produit agrégées `(article, magasin)` sur la période |
| `ca_day` | Graphique CA journalier par magasin |
| `product` + `ref_category` + `ref_supplier` | Enrichissement catégorie / fournisseur par **nom** (`product.name` ≈ `ca_product_day.article`, insensible à la casse) |

### RPC

Migration : `supabase/migrations/20260629140000_ca_analyse_product_lines_rpc.sql`

- Exclut les lignes legacy `magasin = '__all__'`
- Filtre magasin optionnel (`p_magasins`)
- Logique client : `src/lib/ca/analyseVentes.ts`

## Filtres

- **Dates** : du / au (min `HISTORIQUE_FROM_ISO`, max aujourd’hui)
- **Magasins** : multi-select ; caissier limité aux magasins de session
- **Catégories** / **Fournisseurs** : multi-select (+ options « Sans catégorie » / « Sans fournisseur »)
- **Produits** : recherche + chips (vide = tous les produits)

Le bouton **Analyser** déclenche le chargement (pas de requête à chaque changement de filtre).

## Affichage

- **KPIs** : CA total produits, quantité, moyenne CA/jour, nb lignes
- **Graphique** : histogramme SVG journalier (`CaJourHistogram`) — ventes produit filtrées, bascule CA / quantité (même contrôle que le tableau)
- **Tableau** : regroupement produit / catégorie / fournisseur / magasin, tri CA ou quantité

## Limites connues

- **Rapprochement par nom** : un article caisse absent du catalogue apparaît en « Sans catégorie / fournisseur » (identique au TOP 10 CA).
- **Filtre magasin** : nécessite des données ventilées par magasin (`M1`, `M2`, …). Relancer la sync FTP des jours concernés si seules des lignes `__all__` existent.
- **Graphique vs tableau** : les deux utilisent les ventes produit filtrées (`ca_product_day` via RPC) et la métrique sélectionnée (CA ou quantité).
- **Volume** : au-delà de ~5000 lignes brutes RPC, un avertissement invite à réduire la période ou affiner les filtres.

## Composants

- `src/components/VentesProductChipsFilter.tsx` — sélection produits
- `src/components/CaJourHistogram.tsx` — graphique CA journalier
