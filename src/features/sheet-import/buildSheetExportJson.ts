import { PRODUCT_SHEET_EXPORT_SELECT } from '@/lib/products/product-supabase-select'
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
  ref_category: { label: string } | null
  ref_subcategory: { label: string } | null
  ref_supplier: { label: string } | null
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
  return rows.map(row => {
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
