/** Partie / total en pourcentage (0–100+ selon les valeurs). */
export function percentOfPart(part: unknown, whole: unknown): number | null {
  const p = typeof part === 'number' ? part : Number(part)
  const w = typeof whole === 'number' ? whole : Number(whole)
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return null
  return (p / w) * 100
}
