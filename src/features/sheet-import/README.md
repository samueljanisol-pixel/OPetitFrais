# Import Google Sheet (transition)

## Colonnes lues (seules données importées)

`Actif`, `Code`, `Nom`, `Prix`, `UdV`, `Catégorie`, `Fournisseur`, `Arabe` — voir `mapSheetRow.ts` (`SHEET_COLUMNS`).

- **Désactiver l’UI** : `SHEET_IMPORT_ENABLED = false` dans `config.ts`.
- **Retirer du projet** : supprimer
  - `src/features/sheet-import/` (dossier entier),
  - `src/app/api/transition/` (route proxy JSON),
  - dans `ProduitsListClient.tsx` l’import et le composant `SheetImportBar`.
