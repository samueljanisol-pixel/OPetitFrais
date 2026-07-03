# Cuisine (journal Frigo)

Module de saisie quotidienne des **entrées** (production) et **sorties** (invendus / poubelle) pour les produits catégorie **Frigo**.

## Permissions

| Clé | Usage |
|-----|--------|
| `cuisine.saisie` | Saisie du jour courant (CRUD sur `cuisine_journal_entry` pour `journal_date = today` Casablanca) |
| `cuisine.historique` | Consultation de tout l’historique (lecture seule) |

Migration : `supabase/migrations/20260702120000_cuisine_journal.sql`.

## Routes

| Chemin | Rôle |
|--------|------|
| `/cuisine` | Redirection : saisie si `cuisine.saisie`, sinon historique si `cuisine.historique` |
| `/cuisine/saisie` | Journal du jour : listes entrées / sorties, totaux, boutons d’ajout ; lien **Historique** si `cuisine.historique` |
| `/cuisine/saisie/ajouter?type=entree\|sortie` | Grille produits Frigo **actifs** ; filtres sous-catégorie ; **3 à 8 produits par ligne** (préférence mémorisée localement) |
| `/cuisine/saisie/quantite?type=&productId=` | Nouvelle ligne (quantité, min 1, pas ±10/±1) |
| `/cuisine/saisie/quantite?entryId=` | Modifier ou supprimer une ligne du jour (confirmation avant suppression, icône poubelle) |
| `/cuisine/historique` | Vue compacte mobile : date, totaux, **tableau dense** par sous-catégorie (Entrées / Sorties / **Ventes par magasin** M1, M2… + **Total**) ; lien **Saisie** si `cuisine.saisie` |

## Données

- Table `cuisine_journal_entry` : `entry_type` `entree` \| `sortie`, `quantity` > 0.
- Produits : `product` **actifs** (`active = true`), `ref_category.code = 'frigo'`, regroupés par `ref_subcategory`.
- Nom affiché produit : `productDisplayName` (`src/lib/products/product-display-name.ts`) selon locale UI.
- Libellé sous-catégorie : `refDisplayLabel` (`src/lib/products/ref-display-label.ts`) — `label_ar` si locale `ar-MA`, sinon `label`.

## Lib

- `src/lib/cuisine/production-date.ts` — date du jour fuseau `Africa/Casablanca`.
- `src/lib/cuisine/use-journal-day.ts` — surveillance du jour (minuit Casablanca) ; rafraîchit la saisie si la page reste ouverte.
- `src/lib/cuisine/journal-queries.ts` — chargement / écriture Supabase browser.
- `src/lib/cuisine/load-frigo-products.ts` — catalogue Frigo groupé.
- `src/lib/cuisine/picker-columns-preference.ts` — nombre de colonnes du picker (3–8, `localStorage`).
- `src/lib/cuisine/load-product-sales-for-date.ts` — ventes du jour (`ca_product_day`, par magasin M1/M2… + total).
- `src/lib/cuisine/aggregate-product-totals.ts` — totaux par produit regroupés par sous-catégorie (historique).
