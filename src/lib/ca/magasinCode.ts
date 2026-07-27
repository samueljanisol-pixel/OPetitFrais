/** Code magasin canonique pour jointure (`M01` → `M1`, aligné sur `ca_product_day`). */
export function canonicalMagasinCode(code: string): string {
  const raw = code.trim().toUpperCase()
  const m = raw.match(/^M0*(\d+)$/)
  if (m) return `M${m[1]}`
  return raw
}

/** Variantes utiles pour filtres SQL (`M01` et `M1`). */
export function expandMagasinCodeAliases(codes: string[]): string[] {
  const out = new Set<string>()
  for (const c of codes) {
    const t = c.trim()
    if (!t) continue
    out.add(t)
    const canon = canonicalMagasinCode(t)
    out.add(canon)
    const m = canon.match(/^M(\d+)$/)
    if (m) out.add(`M${m[1].padStart(2, '0')}`)
  }
  return [...out]
}

/** Recherche dans une map magasin en tolérant M01 / M1. */
export function lookupByCanonicalMagasin<T>(
  map: Record<string, T>,
  mag: string,
): T | undefined {
  if (Object.prototype.hasOwnProperty.call(map, mag)) return map[mag]
  const canon = canonicalMagasinCode(mag)
  for (const [k, v] of Object.entries(map)) {
    if (canonicalMagasinCode(k) === canon) return v
  }
  return undefined
}
