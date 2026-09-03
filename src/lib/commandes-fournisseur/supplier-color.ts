const SUPPLIER_COLORS = [
  "#0d9488",
  "#2563eb",
  "#9333ea",
  "#c2410c",
  "#be123c",
  "#15803d",
  "#a16207",
  "#7c3aed",
  "#0891b2",
  "#4f46e5",
] as const;

/** Couleur déterministe par fournisseur (listes commandes / lots). */
export function supplierColor(supplierId: string): string {
  let hash = 0;
  for (let i = 0; i < supplierId.length; i++) {
    hash = (hash * 31 + supplierId.charCodeAt(i)) >>> 0;
  }
  return SUPPLIER_COLORS[hash % SUPPLIER_COLORS.length]!;
}
