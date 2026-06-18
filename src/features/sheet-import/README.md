# Import Google Sheet (transition)

## Colonnes lues (seules données importées)

`Actif`, `Code`, `Nom`, `Prix`, `Marge DH Actuelle` (alias « Marge DH »), `UdV`, `Catégorie`, `Sous-Catégorie`, `Fournisseur`, `Arabe` — voir `mapSheetRow.ts` (`SHEET_COLUMNS`). Colonnes → `product.name` / `product.name_ar` (format feuille inchangé).

## Filtre d’import

Au clic sur **Importer depuis Google Sheet**, une fenêtre permet de **cocher les champs** à appliquer aux **produits existants** (mise à jour partielle). **Aucune case cochée par défaut** — sans case cochée, seuls les **nouveaux** produits (absents en base) sont créés. Un produit existant nécessite au moins un champ coché pour être modifié. Un **nouveau produit** est toujours créé avec **toutes** les colonnes lues. Le bandeau résume : créés / modifiés / erreurs.

- **Désactiver l’UI** : `SHEET_IMPORT_ENABLED = false` dans `config.ts`.
- **Retirer du projet** : supprimer
  - `src/features/sheet-import/` (dossier entier),
  - `src/app/api/transition/` (route proxy JSON),
  - dans `ProduitsListClient.tsx` l’import et le composant `SheetImportBar`.
