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
| `product` + `ref_category` + `ref_supplier` | Lien catalogue via `ca_product_day.product_id` |
| `product_price_history` | Marge en vigueur à la date de vente → bénéfice = `qty × marge` (`src/lib/ca/benefitFromSales.ts`) |

### RPC

Migration : `supabase/migrations/20260629140000_ca_analyse_product_lines_rpc.sql`

- Exclut les lignes legacy `magasin = '__all__'` sauf si aucune vente par magasin ce jour-là (comme TOP 10 CA).
- **Tous les magasins** sélectionnés : pas de filtre SQL magasin (`p_magasins` null) pour inclure tout le CA en base.
- Pagination RPC par paquets de 1000 lignes (évite la limite PostgREST).
- Filtre magasin optionnel (`p_magasins`)
- Logique client : `src/lib/ca/analyseVentes.ts`

## Filtres

- **Dates** : du / au (min `HISTORIQUE_FROM_ISO`, max aujourd’hui)
- **Magasins** : multi-select ; profil avec périmètre restreint (`magasinsRestricted`) limité aux magasins de session
- **Catégories** / **Fournisseurs** : multi-select (+ options « Sans catégorie » / « Sans fournisseur »)
- **Produits** : recherche + chips (vide = tous les produits)

Le bouton **Analyser** déclenche le chargement (pas de requête à chaque changement de filtre).

## Affichage

- **KPIs** : CA total (filtres) avec **% du CA période**, **bénéfice total** avec **% du CA filtré** et **% du CA avec marge**, moyenne CA/jour, nb lignes tableau
- **Graphique** : histogramme SVG journalier — bascule **Tri CA** / **Tri qté** / **Tri bénéfice**
- **Tableau** : colonnes CA, quantité, **bénéfice** (% du CA ligne) ; regroupement produit / catégorie / fournisseur / magasin ; en **Tri CA**, colonnes **% période** et **% filtre** (si filtres produit actifs)

## Limites connues

- **Lien catalogue** : uniquement par **code produit** (`product.code`). Dans les JSON Sud Bois, le code est la **clé** de `ventes` (ex. `"91": { "article": "Avocat Local", … }`), lue par `ventesJson.ts`. Padding numérique `91` → `000091`.
- Après migration : relancer `npm run sync:day -- <date>` ou `sync:all` sur les jours à jour pour peupler `product_id` sur les nouvelles syncs.
- **Filtre magasin** : nécessite des données ventilées par magasin (`M1`, `M2`, …). Relancer la sync FTP des jours concernés si seules des lignes `__all__` existent.
- **Graphique vs historique** : les totaux filtres proviennent des ventes produit (`ca_product_day`), pas de `ca_day` ; un écart avec l’historique CA global reste possible.
- **Bénéfice** : `qty × marge` à la date (`qty > 0` uniquement), sans double comptage magasin. Marge prise en compte seulement si renseignée explicitement. Sans filtres catégorie/fournisseur/produit : aligné sur `/ca` et `/historique-ca` (même formule ; l’UUID `product_id` est conservé même hors index catalogue).

## Composants

- `src/components/VentesProductChipsFilter.tsx` — sélection produits
- `src/components/CaJourHistogram.tsx` — graphique CA journalier
