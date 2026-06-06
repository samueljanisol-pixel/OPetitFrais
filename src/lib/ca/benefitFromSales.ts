import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeBenefit,
  enrichLineWithBenefit,
  fetchProductMarginHistory,
  marginAtDateForBenefit,
  type MarginHistoryIndex,
} from '@/lib/products/priceHistory'
import type { CaTopProduitLine, VentesAnalyseLine } from '@/lib/ca/types'

type CaProductBenefitRow = {
  date: string
  magasin: string
  product_id: string | null
  qty: number
  total: number
}

export type BenefitTotals = {
  benefit: number
  /** CA des lignes vente pour lesquelles une marge est connue à la date. */
  caWithMargin: number
}

function normalizeDateCell(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

function sumBenefitAndCaFromProductDayRows(
  rows: CaProductBenefitRow[],
  history: MarginHistoryIndex,
): BenefitTotals {
  const byDate = new Map<string, CaProductBenefitRow[]>()
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date)!.push(row)
  }

  let benefit = 0
  let caWithMargin = 0
  for (const dayRows of byDate.values()) {
    const hasPerMag = dayRows.some(r => r.magasin !== '__all__')
    const source = hasPerMag ? dayRows.filter(r => r.magasin !== '__all__') : dayRows
    for (const r of source) {
      const productId = r.product_id
      if (!productId) continue
      const qty = Number.isFinite(r.qty) ? r.qty : 0
      if (qty <= 0) continue
      const margin = marginAtDateForBenefit(history.get(productId), r.date)
      if (margin == null || !Number.isFinite(margin)) continue
      const lineCa = Number.isFinite(r.total) ? r.total : 0
      if (lineCa > 0) caWithMargin += lineCa
      const lineBenefit = computeBenefit(qty, margin)
      if (lineBenefit != null && Number.isFinite(lineBenefit)) benefit += lineBenefit
    }
  }
  return { benefit, caWithMargin }
}

/** Bénéfice + CA (produits avec marge) sur une plage de dates (`ca_product_day`). */
export async function fetchBenefitTotalsForDateRange(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magIn?: string[],
): Promise<BenefitTotals | { error: string }> {
  const PAGE = 1000
  const allRows: CaProductBenefitRow[] = []
  let offset = 0

  for (;;) {
    let qb = supabase
      .from('ca_product_day')
      .select('date,product_id,qty,total,magasin')
      .gte('date', from)
      .lte('date', to)
    if (magIn !== undefined) {
      qb = magIn.length === 0 ? qb.in('magasin', ['__none__']) : qb.in('magasin', magIn)
    }
    const { data, error } = await qb.range(offset, offset + PAGE - 1)
    if (error) return { error: error.message }
    const chunk = data ?? []
    for (const r of chunk) {
      const qty = typeof r.qty === 'number' ? r.qty : Number(r.qty)
      const total = typeof r.total === 'number' ? r.total : Number(r.total)
      allRows.push({
        date: normalizeDateCell(r.date),
        magasin: String(r.magasin ?? '__all__'),
        product_id:
          typeof r.product_id === 'string' && r.product_id.length > 0 ? r.product_id : null,
        qty: Number.isFinite(qty) ? qty : 0,
        total: Number.isFinite(total) ? total : 0,
      })
    }
    if (chunk.length < PAGE) break
    offset += PAGE
    if (offset > 500_000) return { error: 'Trop de lignes produit sur cette période.' }
  }

  const productIds = allRows
    .map(r => r.product_id)
    .filter((id): id is string => id != null && id.length > 0)
  const ctx = await loadBenefitContext(supabase, productIds)
  if ('error' in ctx) return ctx

  return sumBenefitAndCaFromProductDayRows(allRows, ctx.history)
}

/** Bénéfice total sur une plage de dates (`ca_product_day`). */
export async function fetchTotalBenefitForDateRange(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magIn?: string[],
): Promise<number | { error: string }> {
  const totals = await fetchBenefitTotalsForDateRange(supabase, from, to, magIn)
  if ('error' in totals) return totals
  return totals.benefit
}

/** Évite le double comptage magasin M1/M2/… + legacy `__all__` (même règle que total kg). */
export function dedupeProductLinesByMagasin<T extends { magasin: string }>(lines: T[]): T[] {
  if (!lines.length) return lines
  const hasPerMag = lines.some(l => l.magasin !== '__all__')
  return hasPerMag ? lines.filter(l => l.magasin !== '__all__') : lines
}

export function sumBenefitFromLines(lines: Array<{ benefit?: number | null }>): number {
  return lines.reduce((acc, l) => {
    if (l.benefit == null || !Number.isFinite(l.benefit)) return acc
    return acc + l.benefit
  }, 0)
}

/** CA des lignes pour lesquelles un bénéfice est calculable (marge connue). */
export function sumCaFromLinesWithKnownBenefit(
  lines: Array<{ ca?: number; benefit?: number | null }>,
): number {
  return lines.reduce((acc, l) => {
    if (l.benefit == null || !Number.isFinite(l.benefit)) return acc
    const ca = typeof l.ca === 'number' ? l.ca : Number(l.ca)
    return Number.isFinite(ca) ? acc + ca : acc
  }, 0)
}

/** Lignes vente pour lesquelles une marge historique existe à la date. */
export function linesWithKnownBenefit<T extends { benefit?: number | null }>(lines: T[]): T[] {
  return lines.filter(l => l.benefit != null && Number.isFinite(l.benefit))
}

async function loadBenefitContext(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<{ history: MarginHistoryIndex } | { error: string }> {
  const history = await fetchProductMarginHistory(supabase, productIds)
  if ('error' in history) return { error: history.error }
  return { history }
}

export async function enrichVentesAnalyseLines(
  supabase: SupabaseClient,
  lines: VentesAnalyseLine[],
): Promise<VentesAnalyseLine[] | { error: string }> {
  const productIds = lines.map(l => l.productId).filter((id): id is string => id != null && id.length > 0)
  const ctx = await loadBenefitContext(supabase, productIds)
  if ('error' in ctx) return ctx

  return lines.map(line => enrichLineWithBenefit(line, ctx.history))
}

export async function enrichCaTopProduitLines(
  supabase: SupabaseClient,
  lines: CaTopProduitLine[],
  saleDateIso: string,
): Promise<CaTopProduitLine[] | { error: string }> {
  const productIds = lines
    .map(l => l.productId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const ctx = await loadBenefitContext(supabase, productIds)
  if ('error' in ctx) return ctx

  return lines.map(line => {
    const productId = line.productId ?? null
    if (!productId) {
      return { ...line, margin: null, benefit: null }
    }
    const margin = marginAtDateForBenefit(ctx.history.get(productId), saleDateIso)
    return { ...line, margin, benefit: computeBenefit(line.qty, margin) }
  })
}

export function enrichVentesAnalyseLinesWithIndex(
  lines: VentesAnalyseLine[],
  history: MarginHistoryIndex,
): VentesAnalyseLine[] {
  return lines.map(line => enrichLineWithBenefit(line, history))
}
