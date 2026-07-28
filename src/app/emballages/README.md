# Emballages et Consommables

App backoffice `/emballages` (permission `emballages.read` / `emballages.write`).

## Distinction métier

Ce module couvre les **emballages, étiquettes et consommables** (référentiel unifié `ref_emballage`), distinct de :

- `ref_conditionnement` + `product_packaging` — colis / conditionnements commerciaux
- `product.cost_packaging` — coût comptable « prix emballage »

## Catégories (fixes)

| Code | Libellé |
|------|---------|
| `emballages` | Emballages |
| `etiquettes` | Étiquettes |
| `consommable` | Consommable |

Table `ref_emballage_categorie` — pas d’onglet CRUD (valeurs seedées en migration).

## Fonctionnalités

Trois onglets :

1. **Articles** — référentiel `ref_emballage` : catégorie, référence (optionnelle), libellé, type (`type_id`, optionnel), actif/inactif. Filtre par catégorie. Ordre via flèches.
2. **Types** — référentiel `ref_emballage_type` : libellés éditables (sachet, barquette…), ordre via flèches.
3. **Achats** — bons d'achat `emballage_achat_fiche` + lignes `emballage_achat_ligne` :
   - **Nouvel achat** → fiche ouverte (`statut = ouvert`), vendeur optionnel
   - Saisie des **lignes** (article, quantité, prix unitaire, note)
   - **Clôturer** → fiche en lecture seule (`statut = cloture`), au moins une ligne requise

Détail d'un achat : `/emballages/achats/[id]`

## Fournisseur et vendeurs

Migration seed : fournisseur **« Emballages et Consommables »** (`ref_supplier.code = emballages_consommables`, `commande_active = false`).

Les **vendeurs** se créent dans **Paramètres → Vendeurs**, rattachés à ce fournisseur. Ils apparaissent ensuite dans les selects vendeur des achats.

## Lien produit

| Champ | Catégorie requise | Défaut |
|-------|-------------------|--------|
| `product.emballage_id` | emballages | aucun |
| `product.etiquette_id` | étiquettes | aucune |

Champs optionnels sur la fiche produit, à côté du « Prix emballage ».

## API

| Route | Méthodes |
|-------|----------|
| `/api/emballages` | GET (`?categorie=`) / POST |
| `/api/emballages/[id]` | PATCH / DELETE |
| `/api/emballages/categories` | GET |
| `/api/emballages/vendeurs` | GET |
| `/api/emballages/types` | GET / POST |
| `/api/emballages/types/[id]` | PATCH / DELETE |
| `/api/emballages/achats` | GET (`?from=&to=&statut=`) / POST |
| `/api/emballages/achats/[id]` | GET / PATCH / POST (ligne) / DELETE |
| `/api/emballages/achats/[id]/cloturer` | POST |
| `/api/emballages/achats/[id]/lignes/[ligneId]` | PATCH / DELETE |

Lecture : `emballages.read` \| `emballages.write`. Écriture : `emballages.write`.

## Migrations

- `20260728160000_gestion_emballages.sql` — permissions, référentiel, lien produit emballage
- `20260728170000_emballage_achat_fiches.sql` — fiches achat
- `20260728180000_ref_emballage_type.sql` — types éditables
- `20260728240000_emballages_consommables_extension.sql` — catégories, référence, fournisseur, vendeur achat, étiquette produit

## Types partagés

[`src/lib/emballages/types.ts`](../../lib/emballages/types.ts)
