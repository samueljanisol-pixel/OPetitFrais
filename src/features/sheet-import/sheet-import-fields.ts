/** Champs applicables depuis l’export Google Sheet (hors clé de correspondance). */
export type SheetImportFieldKey =
  | 'actif'
  | 'code'
  | 'nom'
  | 'prix'
  | 'marge'
  | 'udv'
  | 'categorie'
  | 'sousCategorie'
  | 'fournisseur'
  | 'arabe'

export type SheetImportFields = Record<SheetImportFieldKey, boolean>

export const SHEET_IMPORT_FIELD_LABELS: Record<SheetImportFieldKey, string> = {
  actif: 'Actif',
  code: 'Code',
  nom: 'Nom',
  prix: 'Prix',
  marge: 'Marge DH',
  udv: 'UdV',
  categorie: 'Catégorie',
  sousCategorie: 'SousCatégorie',
  fournisseur: 'Fournisseur',
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
  categorie: false,
  sousCategorie: false,
  fournisseur: false,
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
  categorie: true,
  sousCategorie: true,
  fournisseur: true,
  arabe: true,
}

export function hasAnyImportField(fields: SheetImportFields): boolean {
  return SHEET_IMPORT_FIELD_KEYS.some((k) => fields[k])
}
