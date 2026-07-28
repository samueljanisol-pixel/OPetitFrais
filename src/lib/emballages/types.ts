export type EmballageCategorieRow = {
  id: string
  code: string
  label: string
  sort_order: number
}

export type EmballageTypeRow = {
  id: string
  label: string
  sort_order: number
  active: boolean
  created_at?: string
  updated_at?: string
}

export type EmballageVendeurRow = {
  id: string
  label: string
  supplier_id: string
  sort_order: number
}

export type EmballageStatutFiche = 'ouvert' | 'cloture'

export type EmballageRow = {
  id: string
  label: string
  categorie_id: string
  reference: string | null
  type_id: string | null
  sort_order: number
  active: boolean
  created_at?: string
  updated_at?: string
  ref_emballage_type?: Pick<EmballageTypeRow, 'id' | 'label'> | null
  ref_emballage_categorie?: Pick<EmballageCategorieRow, 'id' | 'code' | 'label'> | null
}

export type EmballageAchatFicheRow = {
  id: string
  date_achat: string
  statut: EmballageStatutFiche
  note: string | null
  vendeur_id: string | null
  cloture_at: string | null
  created_at?: string
  updated_at?: string
  total?: number
  ligne_count?: number
  ref_supplier_vendeur?: Pick<EmballageVendeurRow, 'id' | 'label'> | null
}

export type EmballageAchatLigneRow = {
  id: string
  fiche_id: string
  emballage_id: string
  quantite: number
  prix_unitaire: number
  note: string | null
  sort_order: number
  created_at?: string
  updated_at?: string
  ref_emballage?: EmballageRefEmbed | null
}

export type EmballageRefEmbed = {
  id: string
  label: string
  ref_emballage_type?: Pick<EmballageTypeRow, 'id' | 'label'> | Pick<EmballageTypeRow, 'id' | 'label'>[] | null
}

export type EmballageRefRelation = EmballageRefEmbed | EmballageRefEmbed[] | null

export type EmballageTypeRelation =
  | Pick<EmballageTypeRow, 'id' | 'label'>
  | Pick<EmballageTypeRow, 'id' | 'label'>[]
  | null

export type EmballageCategorieRelation =
  | Pick<EmballageCategorieRow, 'id' | 'code' | 'label'>
  | Pick<EmballageCategorieRow, 'id' | 'code' | 'label'>[]
  | null

export type EmballageVendeurRelation =
  | Pick<EmballageVendeurRow, 'id' | 'label'>
  | Pick<EmballageVendeurRow, 'id' | 'label'>[]
  | null

export function normalizeEmballageCategorieRef(
  raw: EmballageCategorieRelation | undefined,
): Pick<EmballageCategorieRow, 'id' | 'code' | 'label'> | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export function normalizeEmballageVendeurRef(
  raw: EmballageVendeurRelation | undefined,
): Pick<EmballageVendeurRow, 'id' | 'label'> | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export function normalizeEmballageTypeRef(
  raw: EmballageTypeRelation | undefined,
): Pick<EmballageTypeRow, 'id' | 'label'> | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export function normalizeEmballageRef(raw: EmballageRefRelation | undefined): EmballageAchatLigneRow['ref_emballage'] {
  if (raw == null) return null
  const row = Array.isArray(raw) ? raw[0] : raw
  if (!row) return null
  const typeRef = row.ref_emballage_type
  const ref_emballage_type = normalizeEmballageTypeRef(
    typeRef as EmballageTypeRelation | undefined,
  )
  return {
    id: row.id,
    label: row.label,
    ref_emballage_type,
  }
}

export function emballageTypeLabel(
  emballage: Pick<EmballageRow, 'label' | 'ref_emballage_type'> | EmballageRefEmbed | null | undefined,
): string {
  if (!emballage) return ''
  const typeLabel = normalizeEmballageTypeRef(
    emballage.ref_emballage_type as EmballageTypeRelation | undefined,
  )?.label
  if (typeLabel) return `${emballage.label} (${typeLabel})`
  return emballage.label
}

export function isEmballageStatutFiche(value: string): value is EmballageStatutFiche {
  return value === 'ouvert' || value === 'cloture'
}

export function parseEmballageNumeric(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(',', '.')
  if (!s) return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function emballageAchatMontant(quantite: number, prixUnitaire: number): number {
  return quantite * prixUnitaire
}

export function emballageAchatLigneMontant(ligne: Pick<EmballageAchatLigneRow, 'quantite' | 'prix_unitaire'>): number {
  return emballageAchatMontant(ligne.quantite, ligne.prix_unitaire)
}
