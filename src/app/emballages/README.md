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

Deux onglets :

1. **Articles** — référentiel `ref_emballage` : catégorie, référence (optionnelle), libellé, type (`type_id`, optionnel), actif/inactif. Filtre par catégorie. Ordre via flèches. Bouton **Commander** → saisie magasin Commandes fournisseur (fournisseur pré-sélectionné).
2. **Types** — référentiel `ref_emballage_type` : libellés éditables (sachet, barquette…), ordre via flèches.

## Commandes fournisseur (flux standard)

Les achats passent par le **même parcours que les produits** :

**Saisie magasin** → **Validation lot** → **Achat** → **Comptes vendeur**

- Fournisseur seed **« Emballages et Consommables »** (`ref_supplier.code = emballages_consommables`, `commande_active = true`).
- Chaque article `ref_emballage` possède un **produit miroir** (`ref_emballage.product_id` → `product`) créé/mis à jour automatiquement (sync API). Ces miroirs n’apparaissent pas dans la liste `/produits` ; codes paddés (`000001`…) distincts des codes catalogue (`330`, `331`…).
- Commande **à l’unité** (`allow_unit_in_commande = true`), sans colis obligatoire.
- **Vendeurs** : Paramètres → Vendeurs, rattachés au fournisseur seed (consolidation / achat / comptes comme Marché).

Lien depuis le catalogue : `/commandes-fournisseur/saisie/nouvelle?supplier=emballages_consommables`

## Distinction BOM vs commande

| Lien | Rôle |
|------|------|
| `product.emballage_id` / `product.etiquette_id` sur produit alimentaire | Emballage / étiquette utilisés en production (BOM) |
| `ref_emballage.product_id` | Produit **commandable** miroir (sync auto) |

## Historique achats legacy

Les tables `emballage_achat_fiche` / `emballage_achat_ligne` sont **conservées en lecture seule** (GET API). Les mutations (POST/PATCH/DELETE) renvoient **410** avec redirection vers Commandes fournisseur. L’onglet Achats et les pages `/emballages/achats/*` ont été retirés.

## Fournisseur et vendeurs

Migration seed : fournisseur **« Emballages et Consommables »** (`ref_supplier.code = emballages_consommables`).

Les **vendeurs** se créent dans **Paramètres → Vendeurs**, rattachés à ce fournisseur.

## Lien produit (BOM)

| Champ | Catégorie requise | Défaut |
|-------|-------------------|--------|
| `product.emballage_id` | emballages | aucun |
| `product.etiquette_id` | étiquettes | aucune |

Champs optionnels sur la fiche produit, à côté du « Prix emballage ».

## API

| Route | Méthodes |
|-------|----------|
| `/api/emballages` | GET (`?categorie=`) / POST (+ sync miroir) |
| `/api/emballages/[id]` | PATCH (+ sync) / DELETE (+ désactivation miroir) |
| `/api/emballages/categories` | GET |
| `/api/emballages/vendeurs` | GET |
| `/api/emballages/types` | GET / POST |
| `/api/emballages/types/[id]` | PATCH / DELETE |
| `/api/emballages/achats` | GET (historique) ; POST → **410** |
| `/api/emballages/achats/[id]` | GET ; PATCH / POST / DELETE → **410** |
| `/api/emballages/achats/[id]/cloturer` | POST → **410** |
| `/api/emballages/achats/[id]/lignes/[ligneId]` | PATCH / DELETE → **410** |

Lecture : `emballages.read` \| `emballages.write`. Écriture : `emballages.write`.

Sync miroir : [`src/lib/emballages/sync-product-mirror.ts`](../../lib/emballages/sync-product-mirror.ts)

## Migrations

- `20260728160000_gestion_emballages.sql` — permissions, référentiel, lien produit emballage
- `20260728170000_emballage_achat_fiches.sql` — fiches achat (legacy, lecture seule)
- `20260728180000_ref_emballage_type.sql` — types éditables
- `20260728240000_emballages_consommables_extension.sql` — catégories, référence, fournisseur, vendeur achat, étiquette produit
- `20260728250000_emballages_commandes_fournisseur.sql` — `commande_active`, `product_id`, catégorie produit, backfill miroirs

## Types partagés

[`src/lib/emballages/types.ts`](../../lib/emballages/types.ts)
