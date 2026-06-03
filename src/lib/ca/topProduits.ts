import type { CaTopProduitLine } from './types'

export type CaTopProduitSimpleRow = {
  name: string
  ca: number
  qty: number
}

export type CaTopProduitPivotRow = {
  name: string
  byMag: Record<string, { ca: number; qty: number }>
  totalCa: number
  totalQty: number
}

export type CaTopProduitRankings =
  | {
      mode: 'simple'
      byCa: CaTopProduitSimpleRow[]
      byQty: CaTopProduitSimpleRow[]
      filteredTotal: number
    }
  | {
      mode: 'pivot'
      magasins: string[]
      byCa: CaTopProduitPivotRow[]
      byQty: CaTopProduitPivotRow[]
      filteredTotal: number
    }

function applyCategoryFilter(lines: CaTopProduitLine[], categoryFilter: string): CaTopProduitLine[] {
  if (categoryFilter === '__none__') {
    return lines.filter(l => !l.categoryId)
  }
  if (categoryFilter !== 'all') {
    return lines.filter(l => l.categoryId === categoryFilter)
  }
  return lines
}

export function aggregateTopProduitLines(lines: CaTopProduitLine[]): CaTopProduitLine[] {
  const hasPerMag = lines.some(l => l.magasin !== '__all__')
  const source = hasPerMag ? lines.filter(l => l.magasin !== '__all__') : lines
  const byName = new Map<string, CaTopProduitLine>()

  for (const line of source) {
    const key = line.productId ?? line.name.trim().toLowerCase()
    const cur = byName.get(key)
    if (!cur) {
      byName.set(key, { ...line })
      continue
    }
    byName.set(key, {
      ...cur,
      name: cur.productId ? cur.name : line.name,
      ca: cur.ca + line.ca,
      qty: cur.qty + line.qty,
    })
  }

  return Array.from(byName.values())
}

export function filterTopProduitLines(
  lines: CaTopProduitLine[],
  magFilter: string,
  categoryFilter: string,
): CaTopProduitLine[] {
  let out = lines

  if (magFilter !== 'all') {
    out = out.filter(l => l.magasin === magFilter)
  } else {
    out = aggregateTopProduitLines(out)
  }

  return applyCategoryFilter(out, categoryFilter)
}

export function buildTopProduitRankings(lines: CaTopProduitLine[]): {
  byCa: CaTopProduitSimpleRow[]
  byQty: CaTopProduitSimpleRow[]
  filteredTotal: number
} {
  const byCa = [...lines]
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 10)
    .map(l => ({ name: l.name, ca: l.ca, qty: l.qty }))
  const byQty = [...lines]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10)
    .map(l => ({ name: l.name, ca: l.ca, qty: l.qty }))
  const filteredTotal = lines.reduce((acc, l) => acc + (Number.isFinite(l.ca) ? l.ca : 0), 0)
  return { byCa, byQty, filteredTotal }
}

export function buildTopProduitPivotRankings(
  lines: CaTopProduitLine[],
  magasins: string[],
): {
  magasins: string[]
  byCa: CaTopProduitPivotRow[]
  byQty: CaTopProduitPivotRow[]
  filteredTotal: number
} {
  const byName = new Map<string, CaTopProduitPivotRow>()

  for (const line of lines) {
    const key = line.name.trim().toLowerCase()
    let row = byName.get(key)
    if (!row) {
      row = {
        name: line.name,
        byMag: {},
        totalCa: 0,
        totalQty: 0,
      }
      byName.set(key, row)
    }

    const mag = line.magasin
    const cur = row.byMag[mag] ?? { ca: 0, qty: 0 }
    row.byMag[mag] = {
      ca: cur.ca + line.ca,
      qty: cur.qty + line.qty,
    }
    row.totalCa += line.ca
    row.totalQty += line.qty
  }

  const rows = Array.from(byName.values())
  const byCa = [...rows].sort((a, b) => b.totalCa - a.totalCa).slice(0, 10)
  const byQty = [...rows].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10)
  const filteredTotal = rows.reduce((acc, r) => acc + r.totalCa, 0)

  return { byCa, byQty, filteredTotal, magasins }
}

export function computeTopProduitRankings(
  lines: CaTopProduitLine[],
  magFilter: string,
  categoryFilter: string,
  magasinOptions: string[],
): CaTopProduitRankings {
  const categorized = applyCategoryFilter(lines, categoryFilter)
  const hasPerMag = categorized.some(l => l.magasin !== '__all__')

  if (magFilter === 'all' && hasPerMag) {
    const perMagLines = categorized.filter(l => l.magasin !== '__all__')
    const magasins =
      magasinOptions.length > 0
        ? magasinOptions
        : [...new Set(perMagLines.map(l => l.magasin))].sort((a, b) => a.localeCompare(b))
    const pivot = buildTopProduitPivotRankings(perMagLines, magasins)
    return { mode: 'pivot', ...pivot }
  }

  const filtered = filterTopProduitLines(lines, magFilter, categoryFilter)
  const simple = buildTopProduitRankings(filtered)
  return { mode: 'simple', ...simple }
}
