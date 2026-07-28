/** Clé UI / DB pour un vendeur d'achat (ou Station sans marchands). */

export const SUPPLIER_SOLE_VENDEUR_KEY = "__supplier_sole__";

export function isSoleVendeurKey(key: string): boolean {
  return key === SUPPLIER_SOLE_VENDEUR_KEY;
}

export function vendeurIdFromKey(vendeurKey: string): string | null {
  if (isSoleVendeurKey(vendeurKey)) return null;
  return vendeurKey.length > 0 ? vendeurKey : null;
}
