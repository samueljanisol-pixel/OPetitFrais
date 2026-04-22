/**
 * Transition Google Sheet → produits
 * Seules les colonnes ci-dessous sont lues (export JSON). Rien d’autre n’est appliqué.
 */

/** Noms de colonnes attendus dans l’export (titre Google Sheet = clé JSON). */
export const SHEET_COLUMNS = {
  actif: 'Actif',
  code: 'Code',
  nom: 'Nom',
  prix: 'Prix',
  udv: 'UdV',
  categorie: 'Catégorie',
  fournisseur: 'Fournisseur',
  arabe: 'Arabe',
} as const

export type SheetRowParsed = {
  actif: boolean
  code: string
  nom: string
  prix: number
  udv: string
  categorie: string
  fournisseur: string
  arabe: string | null
}

function normKey(k: string): string {
  return k.trim().toLowerCase()
}

function getCell(row: Record<string, unknown>, primaryKey: string, aliases: string[] = []): unknown {
  const all = [primaryKey, ...aliases]
  for (const k of Object.keys(row)) {
    const n = normKey(k)
    if (all.some(a => normKey(a) === n)) return row[k]
  }
  return undefined
}

function str(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function boolActif(v: unknown): boolean {
  if (v === true || v === 1) return true
  if (v === false || v === 0) return false
  const s = str(v).toLowerCase()
  if (s === '' || s === '0' || s === 'non' || s === 'n' || s === 'false' || s === 'inactif' || s === 'no') return false
  return true
}

function numPrix(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = str(v).replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Extrait une ligne d’export en ne retenant **que** Actif, Code, Nom, Prix, UdV, Catégorie, Fournisseur, Arabe.
 * Les `aliases` ne servent qu’en secours (orthographe / casse) ; le fichier canonique est les clés de {@link SHEET_COLUMNS}.
 */
export function parseSheetRow(
  row: Record<string, unknown>,
  lineIndex: number,
): { ok: true; data: SheetRowParsed } | { ok: false; error: string } {
  const nom = str(
    getCell(row, SHEET_COLUMNS.nom, [
      'nom',
    ]),
  )
  if (!nom) {
    return { ok: false, error: `Ligne ${lineIndex + 1} : « ${SHEET_COLUMNS.nom} » manquant` }
  }
  const prix = numPrix(getCell(row, SHEET_COLUMNS.prix, ['prix', 'Prix']))
  if (prix == null || prix < 0) {
    return { ok: false, error: `Ligne ${lineIndex + 1} (${nom}) : « ${SHEET_COLUMNS.prix} » invalide` }
  }
  const udv = str(getCell(row, SHEET_COLUMNS.udv, ['udv', 'UDV', 'Unité de vente']))
  if (!udv) {
    return { ok: false, error: `Ligne ${lineIndex + 1} (${nom}) : « ${SHEET_COLUMNS.udv} » manquant` }
  }
  const cat = str(getCell(row, SHEET_COLUMNS.categorie, ['Categorie', 'categorie', 'catégorie']))
  if (!cat) {
    return { ok: false, error: `Ligne ${lineIndex + 1} (${nom}) : « ${SHEET_COLUMNS.categorie} » manquant` }
  }
  const fourn = str(getCell(row, SHEET_COLUMNS.fournisseur, ['fournisseur', 'Fournisseur']))
  if (!fourn) {
    return { ok: false, error: `Ligne ${lineIndex + 1} (${nom}) : « ${SHEET_COLUMNS.fournisseur} » manquant` }
  }
  const arabeRaw = getCell(row, SHEET_COLUMNS.arabe, ['arabe', 'Name_ar', 'name_ar'])
  const arabe = str(arabeRaw) ? str(arabeRaw) : null

  return {
    ok: true,
    data: {
      actif: boolActif(getCell(row, SHEET_COLUMNS.actif, ['actif', 'Actif', 'active'])),
      code: str(getCell(row, SHEET_COLUMNS.code, ['code'])),
      nom,
      prix,
      udv,
      categorie: cat,
      fournisseur: fourn,
      arabe,
    },
  }
}

export function parseSheetJsonToRows(json: unknown): { rows: SheetRowParsed[]; errors: string[] } {
  const errors: string[] = []
  const list = normalizeJsonArray(json)
  const rows: SheetRowParsed[] = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`Élément ${i + 1} : format invalide (objet attendu).`)
      continue
    }
    const r = parseSheetRow(item as Record<string, unknown>, i)
    if (r.ok) rows.push(r.data)
    else errors.push(r.error)
  }
  return { rows, errors }
}

function normalizeJsonArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.rows)) return o.rows
    if (Array.isArray(o.produits)) return o.produits
  }
  return []
}
