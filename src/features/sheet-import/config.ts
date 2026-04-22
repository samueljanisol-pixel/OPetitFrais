/**
 * Transition : import Google Sheet → produits
 * ————————————————————————————————————
 * Suppression : dossier `src/features/sheet-import`, dossier `src/app/api/transition/`,
 * et dans `ProduitsListClient` l’import `sheet-import` + `SheetImportBar`.
 * ————————————————————————————————————
 */
export const SHEET_IMPORT_ENABLED = true

/** Même URL que l’export Web App Apps Script (JSON). */
export const SHEET_JSON_EXPORT_URL =
  'https://script.google.com/macros/s/AKfycbyUwUcDK6FrQW6wzg2MBnunvElNp1MSyH_aw_yQ8E5r3a938l-tmdBmQTOuhNVZYfeS/exec'

/**
 * Chemin d’export JSON (BDD) — même clés que l’import.
 * `GET` complet : `{origin}{SHEET_DB_EXPORT_PATH}?token=...` avec `SHEET_JSON_EXPORT_TOKEN` côté serveur.
 */
export const SHEET_DB_EXPORT_PATH = '/api/transition/sheet-json-export' as const
