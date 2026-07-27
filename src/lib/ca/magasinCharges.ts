import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalMagasinCode } from '@/lib/ca/magasinCode'
import { monthDateBounds } from '@/lib/ca/totalKg'

export type MagasinChargePeriodicite = 'jour' | 'mois'

export type MagasinChargeLine = {
  id: string
  magasin_id: string | null
  magasin_code: string | null
  label: string
  quantite: number
  prix: number
  periodicite: MagasinChargePeriodicite
  sort_order: number
}

export type ChargeTotals = {
  /** Total charges (magasins + générales). */
  total: number
  /** Charges générales uniquement. */
  general: number
  /** Charges par code magasin (sans générales). */
  byMag: Record<string, number>
}

function emptyChargeTotals(): ChargeTotals {
  return { total: 0, general: 0, byMag: {} }
}

export function lineAmount(line: Pick<MagasinChargeLine, 'quantite' | 'prix'>): number {
  const q = Number(line.quantite)
  const p = Number(line.prix)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return q * p
}

export function daysInCalendarMonth(ym: string): number {
  const [yy, mm] = ym.split('-').map((x) => Number(x))
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return 30
  return new Date(Date.UTC(yy, mm, 0)).getUTCDate()
}

/** Jours de période pour une carte mois CA (même logique que moyenne / jour). */
export function daysInPeriodForMonthYm(ym: string, todayIso: string): number {
  const daysInMonth = daysInCalendarMonth(ym)
  const curYm = todayIso.slice(0, 7)
  if (ym === curYm) {
    return Math.max(1, Number(todayIso.slice(8, 10)) || 1)
  }
  return Math.max(1, daysInMonth)
}

export function chargeForDay(line: MagasinChargeLine, dateIso: string): number {
  const amount = lineAmount(line)
  if (amount <= 0) return 0
  if (line.periodicite === 'jour') return amount
  const ym = dateIso.slice(0, 7)
  const dim = daysInCalendarMonth(ym)
  return dim > 0 ? amount / dim : 0
}

export function chargeForMonth(line: MagasinChargeLine, daysInPeriod: number): number {
  const amount = lineAmount(line)
  if (amount <= 0) return 0
  if (line.periodicite === 'mois') return amount
  const days = Math.max(0, daysInPeriod)
  return amount * days
}

function addLineToTotals(acc: ChargeTotals, line: MagasinChargeLine, value: number) {
  if (!Number.isFinite(value) || value === 0) return
  if (line.magasin_id == null) {
    acc.general += value
    acc.total += value
    return
  }
  const code = line.magasin_code?.trim()
  if (!code) return
  acc.byMag[code] = (acc.byMag[code] ?? 0) + value
  acc.total += value
}

function filterLinesForMagCodes(
  lines: MagasinChargeLine[],
  magasinCodes?: string[],
): MagasinChargeLine[] {
  if (magasinCodes === undefined) return lines
  const allowed = new Set(
    magasinCodes
      .map((c) => c.trim())
      .filter(Boolean)
      .flatMap((c) => [c, canonicalMagasinCode(c)]),
  )
  return lines.filter((line) => {
    if (line.magasin_id == null) return true
    const code = line.magasin_code?.trim() ?? ''
    if (!code) return false
    return allowed.has(code) || allowed.has(canonicalMagasinCode(code))
  })
}

export function aggregateChargesForDay(
  lines: MagasinChargeLine[],
  dateIso: string,
  magasinCodes?: string[],
): ChargeTotals {
  const acc = emptyChargeTotals()
  for (const line of filterLinesForMagCodes(lines, magasinCodes)) {
    addLineToTotals(acc, line, chargeForDay(line, dateIso))
  }
  return acc
}

export function aggregateChargesForMonth(
  lines: MagasinChargeLine[],
  daysInPeriod: number,
  magasinCodes?: string[],
): ChargeTotals {
  const acc = emptyChargeTotals()
  for (const line of filterLinesForMagCodes(lines, magasinCodes)) {
    addLineToTotals(acc, line, chargeForMonth(line, daysInPeriod))
  }
  return acc
}

/** Agrégat charges mois pour chaque YM présent dans [from, to]. */
export function aggregateChargesByYmInRange(
  lines: MagasinChargeLine[],
  from: string,
  to: string,
  magasinCodes?: string[],
  daysInPeriodByYm?: Record<string, number>,
): Record<string, ChargeTotals> {
  const out: Record<string, ChargeTotals> = {}
  const fromYm = from.slice(0, 7)
  const toYm = to.slice(0, 7)
  let ym = fromYm
  while (ym <= toYm) {
    const bounds = monthDateBounds(ym)
    const rangeFrom = bounds.from < from ? from : bounds.from
    const rangeTo = bounds.to > to ? to : bounds.to
    let days = daysInPeriodByYm?.[ym]
    if (days == null) {
      // Nombre de jours calendaires de l’intersection période ∩ mois
      const start = Date.parse(`${rangeFrom}T00:00:00.000Z`)
      const end = Date.parse(`${rangeTo}T00:00:00.000Z`)
      days =
        Number.isFinite(start) && Number.isFinite(end) && end >= start
          ? Math.floor((end - start) / 86_400_000) + 1
          : daysInCalendarMonth(ym)
    }
    out[ym] = aggregateChargesForMonth(lines, days, magasinCodes)
    const [yy, mm] = ym.split('-').map((x) => Number(x))
    const next = new Date(Date.UTC(yy, mm, 1))
    ym = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return out
}

type MagasinChargeDbRow = {
  id: string
  magasin_id: string | null
  label: string
  quantite: number | string
  prix: number | string
  periodicite: string
  sort_order: number | null
  magasins: { code: string | null } | { code: string | null }[] | null
}

function magasinCodeFromRelation(
  rel: MagasinChargeDbRow['magasins'],
): string | null {
  if (rel == null) return null
  const row = Array.isArray(rel) ? rel[0] : rel
  const code = row?.code
  return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null
}

export function parsePeriodicite(raw: unknown): MagasinChargePeriodicite | null {
  return raw === 'jour' || raw === 'mois' ? raw : null
}

export function normalizeChargeRows(rows: MagasinChargeDbRow[]): MagasinChargeLine[] {
  const out: MagasinChargeLine[] = []
  for (const r of rows) {
    const periodicite = parsePeriodicite(r.periodicite)
    if (!periodicite) continue
    const quantite = typeof r.quantite === 'number' ? r.quantite : Number(r.quantite)
    const prix = typeof r.prix === 'number' ? r.prix : Number(r.prix)
    if (!Number.isFinite(quantite) || !Number.isFinite(prix)) continue
    out.push({
      id: r.id,
      magasin_id: r.magasin_id,
      magasin_code: r.magasin_id == null ? null : magasinCodeFromRelation(r.magasins),
      label: r.label,
      quantite,
      prix,
      periodicite,
      sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    })
  }
  return out
}

export async function fetchMagasinChargeLines(
  supabase: SupabaseClient,
): Promise<{ lines: MagasinChargeLine[] } | { error: string }> {
  const { data, error } = await supabase
    .from('magasin_charge')
    .select('id, magasin_id, label, quantite, prix, periodicite, sort_order, magasins(code)')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) return { error: error.message }
  return { lines: normalizeChargeRows((data ?? []) as MagasinChargeDbRow[]) }
}

export function benefitNet(benefit: number | undefined | null, charges: number): number | undefined {
  if (benefit == null || !Number.isFinite(benefit)) return undefined
  return benefit - (Number.isFinite(charges) ? charges : 0)
}
