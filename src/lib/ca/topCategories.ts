import type { CaTopProduitLine } from './types'

const SANS_CATEGORIE_KEY = '__none__'

export type CaTopCategorieSimpleRow = {
  label: string
  categoryId: string | null
  ca: number
  qty: number
}

export type CaTopCategoriePivotRow = {
  label: string
  categoryId: string | null
  byMag: Record<string, { ca: number; qty: number }>
  totalCa: number
  totalQty: number
}

export type CaTopCategorieRankings =
  | {
      mode: 'simple'
      byCa: CaTopCategorieSimpleRow[]
      byQty: CaTopCategorieSimpleRow[]
      filteredTotal: number
    }
  | {
      mode: 'pivot'
      magasins: string[]
      byCa: CaTopCategoriePivotRow[]
      byQty: CaTopCategoriePivotRow[]
      filteredTotal: number
    }

function categoryKey(line: CaTopProduitLine): string {
  return line.categoryId ?? SANS_CATEGORIE_KEY
}

function categoryLabelFor(line: CaTopProduitLine): string {
  return line.categoryLabel ?? 'Sans catégorie'
}

function categoryIdFromKey(key: string): string | null {
  return key === SANS_CATEGORIE_KEY ? null : key
}

export function filterTopCategorieSourceLines(
  lines: CaTopProduitLine[],
  magFilter: string,
): CaTopProduitLine[] {
  if (magFilter !== 'all') {
    return lines.filter(l => l.magasin === magFilter)
  }
  const hasPerMag = lines.some(l => l.magasin !== '__all__')
  if (hasPerMag) {
    return lines.filter(l => l.magasin !== '__all__')
  }
  return lines
}

export function buildTopCategorieRankings(lines: CaTopProduitLine[]): {
  byCa: CaTopCategorieSimpleRow[]
  byQty: CaTopCategorieSimpleRow[]
  filteredTotal: number
} {
  const byKey = new Map<string, CaTopCategorieSimpleRow>()

  for (const line of lines) {
    const key = categoryKey(line)
    const cur = byKey.get(key)
    if (!cur) {
      byKey.set(key, {
        label: categoryLabelFor(line),
        categoryId: categoryIdFromKey(key),
        ca: line.ca,
        qty: line.qty,
      })
      continue
    }
    cur.ca += line.ca
    cur.qty += line.qty
  }

  const rows = Array.from(byKey.values())
  const byCa = [...rows].sort((a, b) => b.ca - a.ca).slice(0, 10)
  const byQty = [...rows].sort((a, b) => b.qty - a.qty).slice(0, 10)
  const filteredTotal = rows.reduce((acc, r) => acc + r.ca, 0)

  return { byCa, byQty, filteredTotal }
}

export function buildTopCategoriePivotRankings(
  lines: CaTopProduitLine[],
  magasins: string[],
): {
  magasins: string[]
  byCa: CaTopCategoriePivotRow[]
  byQty: CaTopCategoriePivotRow[]
  filteredTotal: number
} {
  const byKey = new Map<string, CaTopCategoriePivotRow>()

  for (const line of lines) {
    const key = categoryKey(line)
    let row = byKey.get(key)
    if (!row) {
      row = {
        label: categoryLabelFor(line),
        categoryId: categoryIdFromKey(key),
        byMag: {},
        totalCa: 0,
        totalQty: 0,
      }
      byKey.set(key, row)
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

  const rows = Array.from(byKey.values())
  const byCa = [...rows].sort((a, b) => b.totalCa - a.totalCa).slice(0, 10)
  const byQty = [...rows].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10)
  const filteredTotal = rows.reduce((acc, r) => acc + r.totalCa, 0)

  return { byCa, byQty, filteredTotal, magasins }
}

export function computeTopCategorieRankings(
  lines: CaTopProduitLine[],
  magFilter: string,
  magasinOptions: string[],
): CaTopCategorieRankings {
  const source = filterTopCategorieSourceLines(lines, magFilter)
  const hasPerMag = source.some(l => l.magasin !== '__all__')

  if (magFilter === 'all' && hasPerMag) {
    const magasins =
      magasinOptions.length > 0
        ? magasinOptions
        : [...new Set(source.map(l => l.magasin))].sort((a, b) => a.localeCompare(b))
    const pivot = buildTopCategoriePivotRankings(source, magasins)
    return { mode: 'pivot', ...pivot }
  }

  const simple = buildTopCategorieRankings(source)
  return { mode: 'simple', ...simple }
}
