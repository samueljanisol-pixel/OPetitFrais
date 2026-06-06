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
| `/cuisine/saisie` | Journal du jour : listes entrées / sorties, totaux, boutons d’ajout |
| `/cuisine/saisie/ajouter?type=entree\|sortie` | Grille produits Frigo ; filtres par sous-catégorie ; cartes image `contain` |
| `/cuisine/saisie/quantite?type=&productId=` | Nouvelle ligne (quantité, min 1, pas ±10/±1) |
| `/cuisine/saisie/quantite?entryId=` | Modifier ou supprimer une ligne du jour |
| `/cuisine/historique` | Calendrier / sélecteur de date, totaux globaux, **tableau par sous-catégorie** (produit × entrées × sorties) |

## Données

- Table `cuisine_journal_entry` : `entry_type` `entree` \| `sortie`, `quantity` > 0.
- Produits : `product` actifs, `ref_category.code = 'frigo'`, regroupés par `ref_subcategory`.
- Nom affiché : `productDisplayName` (`src/lib/products/product-display-name.ts`) selon locale UI.

## Lib

- `src/lib/cuisine/production-date.ts` — date du jour fuseau `Africa/Casablanca`.
- `src/lib/cuisine/journal-queries.ts` — chargement / écriture Supabase browser.
- `src/lib/cuisine/load-frigo-products.ts` — catalogue Frigo groupé.
- `src/lib/cuisine/aggregate-product-totals.ts` — totaux par produit regroupés par sous-catégorie (historique).
