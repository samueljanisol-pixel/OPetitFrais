/** Clé métier produit + conditionnement (null = à l’unité). */
export function commandeLigneKey(productId: string, productPackagingId: string | null): string {
  return `${productId}::${productPackagingId ?? ""}`;
}

/** Alias lot / commande (même granularité). */
export const lotLigneKey = commandeLigneKey;

export function normalizeProductPackagingId(
  raw: string | null | undefined,
): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function hasDuplicateCommandeLignes(
  lignes: ReadonlyArray<{ productId: string; productPackagingId: string | null; qte?: number }>,
): boolean {
  const seen = new Set<string>();
  for (const l of lignes) {
    if (typeof l.qte === "number" && l.qte <= 0) {
      continue;
    }
    const key = commandeLigneKey(l.productId, l.productPackagingId);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}
