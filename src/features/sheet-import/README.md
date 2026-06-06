# Import Google Sheet (transition)

## Colonnes lues (seules données importées)

`Actif`, `Code`, `Nom`, `Prix`, `Marge DH Actuelle` (alias « Marge DH »), `UdV`, `Catégorie`, `Sous-Catégorie`, `Fournisseur`, `Arabe` — voir `mapSheetRow.ts` (`SHEET_COLUMNS`).

## Filtre d’import

Au clic sur **Importer depuis Google Sheet**, une fenêtre permet de **cocher les champs** à appliquer aux **produits existants** (mise à jour partielle). La correspondance produit utilise toujours Code / Nom depuis la feuille. Un **nouveau produit** (absent en base) est toujours créé avec **toutes** les colonnes lues.

- **Désactiver l’UI** : `SHEET_IMPORT_ENABLED = false` dans `config.ts`.
- **Retirer du projet** : supprimer
  - `src/features/sheet-import/` (dossier entier),
  - `src/app/api/transition/` (route proxy JSON),
  - dans `ProduitsListClient.tsx` l’import et le composant `SheetImportBar`.
