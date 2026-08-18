import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EMBALLAGES_CONSOMMABLES_PRODUCT_CATEGORY_CODE,
  EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE,
} from '@/lib/emballages/constants'

/** Catégorie catalogue (hors miroirs emballages / consommables). */
export function isCatalogCategory(row: { code: string }): boolean {
  return row.code !== EMBALLAGES_CONSOMMABLES_PRODUCT_CATEGORY_CODE
}

/** Fournisseur catalogue (hors miroir emballages / consommables). */
export function isCatalogSupplier(row: { code: string }): boolean {
  return row.code !== EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE
}

/** Partie numérique d’un code produit catalogue (`330`, `000022` → 22). */
export function catalogNumericCode(code: string): number | null {
  const t = code.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Prochain code catalogue : max des codes numériques hors catégorie
 * emballages/consommables, puis + 1 (sans padding, ex. `333`).
 */
export async function allocateNextCatalogProductCode(client: SupabaseClient): Promise<string> {
  const { data: cat, error: catErr } = await client
    .from('ref_category')
    .select('id')
    .eq('code', EMBALLAGES_CONSOMMABLES_PRODUCT_CATEGORY_CODE)
    .maybeSingle()
  if (catErr) throw new Error(catErr.message)

  const catId = (cat as { id?: string } | null)?.id
  let query = client.from('product').select('code')
  if (typeof catId === 'string' && catId.length > 0) {
    query = query.neq('category_id', catId)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)

  let max = 0
  for (const row of data ?? []) {
    const n = catalogNumericCode(String((row as { code?: string }).code ?? ''))
    if (n != null && n > max) max = n
  }
  return String(max + 1)
}
