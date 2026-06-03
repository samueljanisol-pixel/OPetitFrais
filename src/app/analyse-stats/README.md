# Analyse Stats

Page d’analyse des ventes produit sur une plage de dates, avec filtres et regroupements.

## Accès

- Route : `/analyse-stats`
- Permission : `ventes.read`
- Navigation : boutons **Analyse Stats** depuis **Statistique** (`/ca`) et **Historique** (`/historique-ca`)

## Données

| Source | Usage |
|--------|--------|
| `ca_product_day` via RPC `ca_analyse_product_lines` | Ventes produit (KPIs, graphique, tableau) — pagination côté client |
| `product` + `ref_category` + `ref_supplier` | Enrichissement catégorie / fournisseur par **nom** (`product.name` ≈ `ca_product_day.article`, insensible à la casse) |

### RPC

Migration : `supabase/migrations/20260629140000_ca_analyse_product_lines_rpc.sql`

- Exclut les lignes legacy `magasin = '__all__'` sauf si aucune vente par magasin ce jour-là (comme TOP 10 CA).
- **Tous les magasins** sélectionnés : pas de filtre SQL magasin (`p_magasins` null) pour inclure tout le CA en base.
- Pagination RPC par paquets de 1000 lignes (évite la limite PostgREST).
- Filtre magasin optionnel (`p_magasins`)
- Logique client : `src/lib/ca/analyseVentes.ts`

## Filtres

- **Dates** : du / au (min `HISTORIQUE_FROM_ISO`, max aujourd’hui)
- **Magasins** : multi-select ; caissier limité aux magasins de session
- **Catégories** / **Fournisseurs** : multi-select (+ options « Sans catégorie » / « Sans fournisseur »)
- **Produits** : recherche + chips (vide = tous les produits)

Le bouton **Analyser** déclenche le chargement (pas de requête à chaque changement de filtre).

## Affichage

- **KPIs** : CA total (filtres) avec **% du CA période** (même dates et magasins, sans filtre catégorie/fournisseur/produit), moyenne CA/jour, nb lignes tableau
- **Graphique** : histogramme SVG journalier — ventes filtrées, bascule CA / quantité
- **Tableau** : regroupement produit / catégorie / fournisseur / magasin ; en **Tri CA**, colonne **% période** (part du CA ligne / CA période) ; **% filtre** uniquement si catégorie, fournisseur ou produit est sélectionné (part / CA total filtres)

## Limites connues

- **Rapprochement par nom** : un article caisse absent du catalogue apparaît en « Sans catégorie / fournisseur » (identique au TOP 10 CA).
- **Filtre magasin** : nécessite des données ventilées par magasin (`M1`, `M2`, …). Relancer la sync FTP des jours concernés si seules des lignes `__all__` existent.
- **Graphique vs historique** : les totaux filtres proviennent des ventes produit (`ca_product_day`), pas de `ca_day` ; un écart avec l’historique CA global reste possible.

## Composants

- `src/components/VentesProductChipsFilter.tsx` — sélection produits
- `src/components/CaJourHistogram.tsx` — graphique CA journalier
