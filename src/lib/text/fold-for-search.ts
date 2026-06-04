/** Minuscules sans accents pour recherche insensible à la casse et aux diacritiques. */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function textIncludesFolded(haystack: string, needle: string): boolean {
  const foldedNeedle = foldForSearch(needle.trim())
  if (foldedNeedle.length === 0) return true
  return foldForSearch(haystack).includes(foldedNeedle)
}
