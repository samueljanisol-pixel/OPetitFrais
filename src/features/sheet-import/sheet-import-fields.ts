/** Champs applicables depuis l’export Google Sheet (hors clé de correspondance). */
export type SheetImportFieldKey =
  | 'actif'
  | 'code'
  | 'nom'
  | 'prix'
  | 'marge'
  | 'udv'
  | 'udc'
  | 'uda'
  | 'categorie'
  | 'sousCategorie'
  | 'fournisseur'
  | 'marchand'
  | 'arabe'

export type SheetImportFields = Record<SheetImportFieldKey, boolean>

export const SHEET_IMPORT_FIELD_LABELS: Record<SheetImportFieldKey, string> = {
  actif: 'Actif',
  code: 'Code',
  nom: 'Nom',
  prix: 'Prix',
  marge: 'Marge DH',
  udv: 'UdV',
  udc: 'UdC',
  uda: 'UdA',
  categorie: 'Catégorie',
  sousCategorie: 'SousCatégorie',
  fournisseur: 'Fournisseur',
  marchand: 'Marchand (Vendeur)',
  arabe: 'Arabe',
}

export const SHEET_IMPORT_FIELD_KEYS = Object.keys(
  SHEET_IMPORT_FIELD_LABELS,
) as SheetImportFieldKey[]

export const DEFAULT_SHEET_IMPORT_FIELDS: SheetImportFields = {
  actif: false,
  code: false,
  nom: false,
  prix: false,
  marge: false,
  udv: false,
  udc: false,
  uda: false,
  categorie: false,
  sousCategorie: false,
  fournisseur: false,
  marchand: false,
  arabe: false,
}

/** Tous les champs feuille — utilisé à la création d’un produit absent en base. */
export const ALL_SHEET_IMPORT_FIELDS: SheetImportFields = {
  actif: true,
  code: true,
  nom: true,
  prix: true,
  marge: true,
  udv: true,
  udc: true,
  uda: true,
  categorie: true,
  sousCategorie: true,
  fournisseur: true,
  marchand: true,
  arabe: true,
}

export function hasAnyImportField(fields: SheetImportFields): boolean {
  return SHEET_IMPORT_FIELD_KEYS.some((k) => fields[k])
}

/** Normalise un objet config (API / JSONB) en {@link SheetImportFields}. */
export function normalizeSheetImportFields(raw: unknown): SheetImportFields {
  const result: SheetImportFields = { ...DEFAULT_SHEET_IMPORT_FIELDS }
  if (raw == null || typeof raw !== 'object') return result
  const obj = raw as Record<string, unknown>
  for (const key of SHEET_IMPORT_FIELD_KEYS) {
    if (typeof obj[key] === 'boolean') {
      result[key] = obj[key]
    }
  }
  return result
}

/** Champs à appliquer aux produits existants (config tâche planifiée ou legacy `updateFields`). */
export function importFieldsFromTaskConfig(config: {
  updateFields?: 'all' | 'new_only'
  importFields?: unknown
}): SheetImportFields {
  if (config.importFields != null && typeof config.importFields === 'object') {
    return normalizeSheetImportFields(config.importFields)
  }
  if (config.updateFields === 'new_only') {
    return { ...DEFAULT_SHEET_IMPORT_FIELDS }
  }
  return { ...ALL_SHEET_IMPORT_FIELDS }
}
