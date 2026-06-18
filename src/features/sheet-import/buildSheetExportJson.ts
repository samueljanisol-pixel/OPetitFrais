import { SHEET_COLUMNS } from './mapSheetRow'
import { PRODUCT_SHEET_EXPORT_SELECT } from '@/lib/products/product-supabase-select'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = {
  code: string
  name: string
  price: number
  margin: number | null
  active: boolean
  name_ar: string | null
  ref_sales_unit: { label: string } | null
  ref_category: { label: string } | null
  ref_subcategory: { label: string } | null
  ref_supplier: { label: string } | null
}

/**
 * Lignes JSON dans le même format que l’import (clés = titres de colonnes Sheet, voir {@link SHEET_COLUMNS}).
 */
export async function buildSheetExportPayload(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('product')
    .select(PRODUCT_SHEET_EXPORT_SELECT)
    .order('code', { ascending: true })
  if (error) throw error
  const C = SHEET_COLUMNS
  const rows = (data ?? []) as unknown as Row[]
  return rows.map(row => {
    const ar = row.name_ar?.trim() ? row.name_ar : null
    return {
      [C.actif]: row.active,
      [C.code]: row.code ?? '',
      [C.nom]: row.name,
      [C.prix]: Number(row.price),
      [C.marge]: row.margin != null && Number.isFinite(Number(row.margin)) ? Number(row.margin) : null,
      [C.udv]: row.ref_sales_unit?.label ?? '',
      [C.categorie]: row.ref_category?.label ?? '',
      [C.sousCategorie]: row.ref_subcategory?.label ?? '',
      [C.fournisseur]: row.ref_supplier?.label ?? '',
      [C.arabe]: ar,
    }
  })
}
