# Gestion Emballages

App backoffice `/emballages` (permission `emballages.read` / `emballages.write`).

## Distinction métier

Ce module couvre les **matériaux d'emballage** (sachet, barquette, bouteille, sac de vente), distinct de :

- `ref_conditionnement` + `product_packaging` — colis / conditionnements commerciaux
- `product.cost_packaging` — coût comptable « prix emballage »

## Fonctionnalités

Deux onglets principaux et un onglet types :

1. **Emballages** — référentiel `ref_emballage` : libellé, type (`type_id`), actif/inactif. Ordre via flèches.
2. **Types** — référentiel `ref_emballage_type` : libellés éditables, ordre via flèches.
3. **Achats** — bons d'achat `emballage_achat_fiche` + lignes `emballage_achat_ligne` :
   - **Nouvel achat** → fiche ouverte (`statut = ouvert`)
   - Saisie des **lignes** (emballage, quantité, prix unitaire, note)
   - **Clôturer** → fiche en lecture seule (`statut = cloture`), au moins une ligne requise

Détail d'un achat : `/emballages/achats/[id]`

## Lien produit

Champ optionnel `product.emballage_id` (défaut `NULL` = aucun) sur la fiche produit, à côté du « Prix emballage ».

## API

| Route | Méthodes |
|-------|----------|
| `/api/emballages` | GET / POST |
| `/api/emballages/[id]` | PATCH / DELETE |
| `/api/emballages/types` | GET / POST |
| `/api/emballages/types/[id]` | PATCH / DELETE |
| `/api/emballages/achats` | GET (`?from=&to=&statut=`) / POST (nouvelle fiche ouverte) |
| `/api/emballages/achats/[id]` | GET / PATCH (entête si ouvert) / POST (ajouter ligne) / DELETE (fiche ouverte) |
| `/api/emballages/achats/[id]/cloturer` | POST |
| `/api/emballages/achats/[id]/lignes/[ligneId]` | PATCH / DELETE |

Lecture : `emballages.read` \| `emballages.write`. Écriture : `emballages.write`.

Suppression d'un emballage refusée (409) si des lignes d'achat y sont liées.

## Migrations

- `20260728160000_gestion_emballages.sql` — permissions, référentiel, lien produit
- `20260728180000_ref_emballage_type.sql` — types éditables + `ref_emballage.type_id`

## Types partagés

[`src/lib/emballages/types.ts`](../../lib/emballages/types.ts)
