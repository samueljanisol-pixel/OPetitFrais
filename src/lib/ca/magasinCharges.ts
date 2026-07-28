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

/** Ligne de montant (estimation ou feuille réelle) pour agrégation. */
export type MagasinChargeAmountLine = {
  magasin_id: string | null
  magasin_code: string | null
  quantite: number
  prix: number
}

/** Bundle des feuilles réelles indexées par YM (présence = feuille créée, même vide). */
export type ChargeFeuilleBundle = {
  sheetYms: Set<string>
  linesByYm: Record<string, MagasinChargeAmountLine[]>
}

function emptyChargeTotals(): ChargeTotals {
  return { total: 0, general: 0, byMag: {} }
}

export function lineAmount(line: Pick<MagasinChargeAmountLine, 'quantite' | 'prix'>): number {
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
  addAmountLineToTotals(acc, line, value)
}

function addAmountLineToTotals(
  acc: ChargeTotals,
  line: Pick<MagasinChargeAmountLine, 'magasin_id' | 'magasin_code'>,
  value: number,
) {
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
  return filterAmountLinesForMagCodes(lines, magasinCodes) as MagasinChargeLine[]
}

function filterAmountLinesForMagCodes<T extends MagasinChargeAmountLine>(
  lines: T[],
  magasinCodes?: string[],
): T[] {
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

type FeuilleDbRow = { id: string; ym: string }
type FeuilleLigneDbRow = {
  feuille_id: string
  magasin_id: string | null
  quantite: number | string
  prix: number | string
  magasins: { code: string | null } | { code: string | null }[] | null
}

/** Feuilles réelles présentes dans [fromYm, toYm] (+ lignes), même si une feuille est vide. */
export async function fetchChargeFeuilleBundle(
  supabase: SupabaseClient,
  fromYm: string,
  toYm: string,
): Promise<{ data: ChargeFeuilleBundle } | { error: string }> {
  const { data: feuilles, error } = await supabase
    .from('magasin_charge_feuille')
    .select('id, ym')
    .gte('ym', fromYm)
    .lte('ym', toYm)

  if (error) return { error: error.message }

  const sheetYms = new Set<string>()
  const idToYm = new Map<string, string>()
  for (const f of (feuilles ?? []) as FeuilleDbRow[]) {
    if (typeof f.ym === 'string' && /^\d{4}-\d{2}$/.test(f.ym)) {
      sheetYms.add(f.ym)
      idToYm.set(f.id, f.ym)
    }
  }

  const linesByYm: Record<string, MagasinChargeAmountLine[]> = {}
  for (const ym of sheetYms) linesByYm[ym] = []

  const ids = Array.from(idToYm.keys())
  if (ids.length > 0) {
    const { data: lignes, error: le } = await supabase
      .from('magasin_charge_feuille_ligne')
      .select('feuille_id, magasin_id, quantite, prix, magasins(code)')
      .in('feuille_id', ids)

    if (le) return { error: le.message }

    for (const r of (lignes ?? []) as FeuilleLigneDbRow[]) {
      const ym = idToYm.get(r.feuille_id)
      if (!ym) continue
      const quantite = typeof r.quantite === 'number' ? r.quantite : Number(r.quantite)
      const prix = typeof r.prix === 'number' ? r.prix : Number(r.prix)
      if (!Number.isFinite(quantite) || !Number.isFinite(prix)) continue
      if (!linesByYm[ym]) linesByYm[ym] = []
      linesByYm[ym].push({
        magasin_id: r.magasin_id,
        magasin_code: r.magasin_id == null ? null : magasinCodeFromRelation(r.magasins),
        quantite,
        prix,
      })
    }
  }

  return { data: { sheetYms, linesByYm } }
}

export function aggregateRealChargesForMonth(
  lines: MagasinChargeAmountLine[],
  magasinCodes?: string[],
): ChargeTotals {
  const acc = emptyChargeTotals()
  for (const line of filterAmountLinesForMagCodes(lines, magasinCodes)) {
    addAmountLineToTotals(acc, line, lineAmount(line))
  }
  return acc
}

/** Prorata jour = total mois feuille ÷ jours calendaires du mois. */
export function aggregateRealChargesForDay(
  lines: MagasinChargeAmountLine[],
  dateIso: string,
  magasinCodes?: string[],
): ChargeTotals {
  const month = aggregateRealChargesForMonth(lines, magasinCodes)
  const dim = daysInCalendarMonth(dateIso.slice(0, 7))
  if (dim <= 0) return emptyChargeTotals()
  const scale = 1 / dim
  const byMag: Record<string, number> = {}
  for (const [k, v] of Object.entries(month.byMag)) {
    byMag[k] = v * scale
  }
  return {
    total: month.total * scale,
    general: month.general * scale,
    byMag,
  }
}

export function resolveChargesForDay(
  estimationLines: MagasinChargeLine[],
  bundle: ChargeFeuilleBundle,
  dateIso: string,
  magasinCodes?: string[],
): ChargeTotals {
  const ym = dateIso.slice(0, 7)
  if (bundle.sheetYms.has(ym)) {
    return aggregateRealChargesForDay(bundle.linesByYm[ym] ?? [], dateIso, magasinCodes)
  }
  return aggregateChargesForDay(estimationLines, dateIso, magasinCodes)
}

export function resolveChargesForMonth(
  estimationLines: MagasinChargeLine[],
  bundle: ChargeFeuilleBundle,
  ym: string,
  daysInPeriod: number,
  magasinCodes?: string[],
): ChargeTotals {
  if (bundle.sheetYms.has(ym)) {
    return aggregateRealChargesForMonth(bundle.linesByYm[ym] ?? [], magasinCodes)
  }
  return aggregateChargesForMonth(estimationLines, daysInPeriod, magasinCodes)
}

/** Agrégat charges mois pour chaque YM : réel si feuille, sinon estimation. */
export function resolveChargesByYmInRange(
  estimationLines: MagasinChargeLine[],
  bundle: ChargeFeuilleBundle,
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
      const start = Date.parse(`${rangeFrom}T00:00:00.000Z`)
      const end = Date.parse(`${rangeTo}T00:00:00.000Z`)
      days =
        Number.isFinite(start) && Number.isFinite(end) && end >= start
          ? Math.floor((end - start) / 86_400_000) + 1
          : daysInCalendarMonth(ym)
    }
    out[ym] = resolveChargesForMonth(estimationLines, bundle, ym, days, magasinCodes)
    const [yy, mm] = ym.split('-').map((x) => Number(x))
    const next = new Date(Date.UTC(yy, mm, 1))
    ym = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return out
}

export function benefitNet(benefit: number | undefined | null, charges: number): number | undefined {
  if (benefit == null || !Number.isFinite(benefit)) return undefined
  return benefit - (Number.isFinite(charges) ? charges : 0)
}
