import { PRODUCT_SHEET_EXPORT_SELECT } from '@/lib/products/product-supabase-select'
import {
  EMBALLAGES_CONSOMMABLES_PRODUCT_CATEGORY_CODE,
  EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE,
} from '@/lib/emballages/constants'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Clés JSON de l’export BDD (équivalent fichier Sheet, sous-ensemble demandé).
 * `PrixAchat` ← `product.cost_purchase` (colonne Sheet « Prix Achat »).
 */
export const SHEET_DB_EXPORT_COLUMNS = {
  code: 'code',
  actif: 'Actif',
  nom: 'Nom',
  prix: 'Prix',
  prixAchat: 'PrixAchat',
  fournisseur: 'Fournisseur',
  categorie: 'Catégorie',
  sousCategorie: 'SousCatégorie',
  arabe: 'Arabe',
  udv: 'UdV',
} as const

type Row = {
  code: string
  name: string
  price: number
  cost_purchase: number | null
  active: boolean
  name_ar: string | null
  ref_sales_unit: { label: string } | null
  ref_category: { label: string; code?: string | null } | null
  ref_subcategory: { label: string } | null
  ref_supplier: { label: string; code?: string | null } | null
}

function isExcludedSheetExportProduct(row: Row): boolean {
  const categoryCode = row.ref_category?.code?.trim()
  if (categoryCode === EMBALLAGES_CONSOMMABLES_PRODUCT_CATEGORY_CODE) {
    return true
  }
  const supplierCode = row.ref_supplier?.code?.trim()
  return supplierCode === EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE
}

/**
 * Lignes JSON au format Sheet (clés = {@link SHEET_DB_EXPORT_COLUMNS}).
 */
export async function buildSheetExportPayload(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('product')
    .select(PRODUCT_SHEET_EXPORT_SELECT)
    .order('code', { ascending: true })
  if (error) throw error
  const C = SHEET_DB_EXPORT_COLUMNS
  const rows = (data ?? []) as unknown as Row[]
  return rows.filter(row => !isExcludedSheetExportProduct(row)).map(row => {
    const ar = row.name_ar?.trim() ? row.name_ar : null
    const prixAchat =
      row.cost_purchase != null && Number.isFinite(Number(row.cost_purchase))
        ? Number(row.cost_purchase)
        : null
    return {
      [C.code]: row.code ?? '',
      [C.actif]: row.active,
      [C.nom]: row.name,
      [C.prix]: Number(row.price),
      [C.prixAchat]: prixAchat,
      [C.fournisseur]: row.ref_supplier?.label ?? '',
      [C.categorie]: row.ref_category?.label ?? '',
      [C.sousCategorie]: row.ref_subcategory?.label ?? '',
      [C.arabe]: ar,
      [C.udv]: row.ref_sales_unit?.label ?? '',
    }
  })
}
