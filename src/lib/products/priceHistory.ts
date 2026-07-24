import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductPriceHistoryRow } from '@/lib/products/types'

export type ProductPricingSnapshot = {
  price: number
  cost_purchase: number | null
  cost_manufacturing: number | null
  cost_packaging: number | null
  margin: number | null
}

export type MarginHistoryEntry = Pick<
  ProductPriceHistoryRow,
  'product_id' | 'valid_from' | 'margin' | 'price' | 'cost_purchase' | 'cost_manufacturing' | 'cost_packaging'
>

export type MarginHistoryIndex = Map<string, MarginHistoryEntry[]>

/** Fin de journée UTC pour une date ISO YYYY-MM-DD. */
export function endOfUtcDayMs(isoDate: string): number {
  const [yy, mm, dd] = isoDate.slice(0, 10).split('-').map(x => Number(x))
  if (!yy || !mm || !dd) return NaN
  return Date.UTC(yy, mm - 1, dd, 23, 59, 59, 999)
}

/** Début de journée UTC (ISO instant) pour une date YYYY-MM-DD. */
export function startOfUtcDayIso(isoDate: string): string {
  return `${isoDate.slice(0, 10)}T00:00:00.000Z`
}

/**
 * Enregistre un instantané tarifaire dans l'historique.
 * `valid_from` optionnel : date ISO (YYYY-MM-DD) ou instant ; défaut = now() côté base.
 */
export async function insertProductPriceHistoryRow(
  supabase: SupabaseClient,
  args: { product_id: string; valid_from?: string } & ProductPricingSnapshot,
) {
  const margin =
    args.margin != null && Number.isFinite(Number(args.margin)) ? Number(args.margin) : null
  const validFrom =
    args.valid_from != null && args.valid_from.length >= 10
      ? args.valid_from.length === 10
        ? startOfUtcDayIso(args.valid_from)
        : args.valid_from
      : undefined
  return supabase.from('product_price_history').insert({
    product_id: args.product_id,
    valid_from: validFrom,
    price: args.price,
    cost_purchase: args.cost_purchase,
    cost_manufacturing: args.cost_manufacturing,
    cost_packaging: args.cost_packaging,
    margin,
  } as never)
}

export function pricingSnapshotChanged(
  prev: ProductPricingSnapshot | null,
  next: ProductPricingSnapshot,
): boolean {
  if (!prev) return true
  return (
    prev.price !== next.price ||
    (prev.cost_purchase ?? null) !== (next.cost_purchase ?? null) ||
    (prev.cost_manufacturing ?? null) !== (next.cost_manufacturing ?? null) ||
    (prev.cost_packaging ?? null) !== (next.cost_packaging ?? null) ||
    (prev.margin ?? null) !== (next.margin ?? null)
  )
}

/** Charge l'historique marge pour une liste de produits (tri desc valid_from par produit). */
export async function fetchProductMarginHistory(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<MarginHistoryIndex | { error: string }> {
  const ids = [...new Set(productIds.filter(id => id.length > 0))]
  const index: MarginHistoryIndex = new Map()
  if (ids.length === 0) return index

  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('product_price_history')
      .select('product_id, valid_from, margin, price, cost_purchase, cost_manufacturing, cost_packaging')
      .in('product_id', chunk)
      .order('valid_from', { ascending: false })

    if (error) return { error: error.message }

    for (const row of (data ?? []) as MarginHistoryEntry[]) {
      const pid = row.product_id
      if (!pid) continue
      const list = index.get(pid) ?? []
      list.push(row)
      index.set(pid, list)
    }
  }

  for (const [pid, rows] of index) {
    rows.sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))
    index.set(pid, rows)
  }

  return index
}

function marginNumberFromRow(row: MarginHistoryEntry): number | null {
  if (row.margin == null) return null
  const m = typeof row.margin === 'number' ? row.margin : Number(row.margin)
  return Number.isFinite(m) ? m : null
}

/**
 * Marge « renseignée » : valeur stockée explicitement (pas de calcul prix − coûts).
 */
export function isExplicitHistoryMargin(row: MarginHistoryEntry): boolean {
  return marginNumberFromRow(row) != null
}

/** Marge catalogue actuelle par id produit. */
export async function fetchProductMarginByIds(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Map<string, number | null> | { error: string }> {
  const map = new Map<string, number | null>()
  const ids = [...new Set(productIds.filter(id => id.length > 0))]
  if (ids.length === 0) return map

  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await supabase.from('product').select('id, margin').in('id', chunk)
    if (error) return { error: error.message }
    for (const row of data ?? []) {
      const id = String(row.id ?? '')
      if (!id) continue
      const m = row.margin == null ? null : Number(row.margin)
      map.set(id, m != null && Number.isFinite(m) ? m : null)
    }
  }
  return map
}

/** Marge en vigueur à la date de vente (dernière ligne avec valid_from <= fin de journée UTC). */
export function marginAtDate(rows: MarginHistoryEntry[] | undefined, saleDateIso: string): number | null {
  if (!rows?.length) return null
  const cutoff = endOfUtcDayMs(saleDateIso.slice(0, 10))
  if (!Number.isFinite(cutoff)) return null

  for (const row of rows) {
    const t = Date.parse(String(row.valid_from))
    if (!Number.isFinite(t) || t > cutoff) continue
    return marginNumberFromRow(row)
  }

  return null
}

/** Marge pour bénéfice : uniquement si renseignée explicitement en historique. */
export function marginAtDateForBenefit(
  rows: MarginHistoryEntry[] | undefined,
  saleDateIso: string,
): number | null {
  if (!rows?.length) return null
  const cutoff = endOfUtcDayMs(saleDateIso.slice(0, 10))
  if (!Number.isFinite(cutoff)) return null

  for (const row of rows) {
    const t = Date.parse(String(row.valid_from))
    if (!Number.isFinite(t) || t > cutoff) continue
    if (!isExplicitHistoryMargin(row)) return null
    return marginNumberFromRow(row)
  }

  return null
}

export function computeBenefit(qty: number, margin: number | null): number | null {
  if (margin == null || !Number.isFinite(margin)) return null
  if (!Number.isFinite(qty) || qty <= 0) return null
  return qty * margin
}

export function enrichLineWithBenefit<T extends { productId: string | null; date: string; qty: number }>(
  line: T,
  historyIndex: MarginHistoryIndex,
): T & { margin: number | null; benefit: number | null } {
  if (!line.productId) {
    return { ...line, margin: null, benefit: null }
  }
  const margin = marginAtDateForBenefit(historyIndex.get(line.productId), line.date)
  return { ...line, margin, benefit: computeBenefit(line.qty, margin) }
}
