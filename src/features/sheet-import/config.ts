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
 * Export JSON BDD (équivalent Sheet) — colonnes :
 * code, Actif, Nom, Prix, PrixAchat, Fournisseur, Catégorie, SousCatégorie, Arabe, UdV.
 * Accès sans session : `{origin}{SHEET_DB_EXPORT_PATH}?token=...`
 * (`SHEET_JSON_EXPORT_TOKEN` / `NEXT_PUBLIC_SHEET_JSON_EXPORT_TOKEN`).
 */
export const SHEET_DB_EXPORT_PATH = '/api/transition/sheet-json-export' as const

/** Token public pour le lien d’export (même valeur que `SHEET_JSON_EXPORT_TOKEN` côté serveur). */
export function sheetDbExportToken(): string {
  return (process.env.NEXT_PUBLIC_SHEET_JSON_EXPORT_TOKEN ?? '').trim()
}

function withExportToken(pathAndQuery: string): string {
  const token = sheetDbExportToken()
  if (!token) return pathAndQuery
  const sep = pathAndQuery.includes('?') ? '&' : '?'
  return `${pathAndQuery}${sep}token=${encodeURIComponent(token)}`
}

/** URL d’export produits avec token (chemin relatif). */
export function sheetDbExportHref(): string {
  return withExportToken(SHEET_DB_EXPORT_PATH)
}

/**
 * Date de dernière modif produits — même forme que
 * `…/exec?format=date` → `{ "lastModified": "YYYYMMDDHHmmss" }`.
 */
export function sheetDbExportDateHref(): string {
  return withExportToken(`${SHEET_DB_EXPORT_PATH}?format=date`)
}
