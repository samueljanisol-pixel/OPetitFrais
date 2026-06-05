import type { SupabaseClient } from '@supabase/supabase-js'
import {
  catalogEntryForProductId,
  fetchProductCatalogIndex,
  type ProductCatalogIndex,
} from './productCatalogMatch'
import type { CaTopProduitLine } from './types'

/** UdV catalogue considérée comme kilogramme (code `kg` ou libellé équivalent). */
export function isKgSalesUnit(code: string | null | undefined, label: string | null | undefined): boolean {
  const c = code?.trim().toLowerCase()
  if (c === 'kg') return true
  const l = label?.trim().toLowerCase()
  return l === 'kg' || l === 'kilogramme' || l === 'kilogrammes'
}

type CaProductQtyRow = {
  date: string
  magasin: string
  article: string
  product_id: string | null
  qty: unknown
}

function normalizeDateCell(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

function isKgFromCatalog(
  catalog: ProductCatalogIndex,
  article: string,
  productId: string | null,
): boolean {
  const linked =
    catalogEntryForProductId(catalog, productId) ?? catalog.resolveByCode(null, article)
  if (!linked) return false
  return isKgSalesUnit(linked.salesUnitCode, linked.salesUnitLabel)
}

/** Somme des quantités kg pour une liste TOP produit (évite le double comptage magasin / __all__). */
export function sumKgQtyFromTopProduitLines(lines: CaTopProduitLine[]): number {
  if (!lines.length) return 0
  const hasPerMag = lines.some(l => l.magasin !== '__all__')
  const source = hasPerMag ? lines.filter(l => l.magasin !== '__all__') : lines
  let total = 0
  for (const line of source) {
    if (!isKgSalesUnit(line.salesUnitCode, line.salesUnitLabel)) continue
    const qty = Number.isFinite(line.qty) ? line.qty : 0
    total += qty
  }
  return total
}

function sumKgQtyFromDayRows(rows: CaProductQtyRow[], catalog: ProductCatalogIndex): number {
  const byDate = new Map<string, CaProductQtyRow[]>()
  for (const row of rows) {
    const d = row.date
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(row)
  }

  let total = 0
  for (const dayRows of byDate.values()) {
    const hasPerMag = dayRows.some(r => r.magasin !== '__all__')
    const source = hasPerMag ? dayRows.filter(r => r.magasin !== '__all__') : dayRows
    for (const r of source) {
      const article = String(r.article ?? '').trim()
      const productId =
        typeof r.product_id === 'string' && r.product_id.length > 0 ? r.product_id : null
      if (!article || !isKgFromCatalog(catalog, article, productId)) continue
      const qty = typeof r.qty === 'number' ? r.qty : Number(r.qty)
      if (Number.isFinite(qty) && qty > 0) total += qty
    }
  }
  return total
}

export function monthDateBounds(ym: string): { from: string; to: string } {
  const [yy, mm] = ym.split('-').map(x => Number(x))
  const from = `${ym}-01`
  const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  const to = `${ym}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** Total quantités kg sur une plage de dates (`ca_product_day`). */
export async function fetchTotalKgQtyForDateRange(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magIn?: string[],
): Promise<number> {
  const catalog = await fetchProductCatalogIndex(supabase)
  const PAGE = 1000
  const allRows: CaProductQtyRow[] = []
  let offset = 0

  for (;;) {
    let qb = supabase
      .from('ca_product_day')
      .select('date,article,product_id,qty,magasin')
      .gte('date', from)
      .lte('date', to)
    if (magIn !== undefined) {
      qb = magIn.length === 0 ? qb.in('magasin', ['__none__']) : qb.in('magasin', magIn)
    }
    const { data, error } = await qb.range(offset, offset + PAGE - 1)
    if (error) return 0
    const chunk = (data ?? []) as Array<{
      date: unknown
      article: string
      product_id: string | null
      qty: unknown
      magasin: string
    }>
    for (const r of chunk) {
      allRows.push({
        date: normalizeDateCell(r.date),
        article: String(r.article ?? ''),
        product_id: r.product_id,
        qty: r.qty,
        magasin: String(r.magasin ?? '__all__'),
      })
    }
    if (chunk.length < PAGE) break
    offset += PAGE
  }

  return sumKgQtyFromDayRows(allRows, catalog)
}
