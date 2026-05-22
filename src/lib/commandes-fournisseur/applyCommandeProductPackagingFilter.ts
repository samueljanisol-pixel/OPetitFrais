import {
  commandeAllowsUnitProduct,
  filterPackagingForCommandePurchase,
} from "@/lib/products/packagingEligibility";

export type ProductWithPackagingForCommande = {
  id: string;
  allow_unit_in_commande?: boolean | null;
  product_packaging?: unknown;
};

/**
 * Filtre les lignes product_packaging éligibles à la commande pour un magasin,
 * et retire les produits sans aucune option de commande (ni unité ni colis).
 */
export function applyCommandeProductPackagingFilter<T extends ProductWithPackagingForCommande>(
  products: T[],
  magasinId: string | null | undefined,
  commandSupplierId?: string | null,
): T[] {
  const out: T[] = [];
  for (const row of products) {
    const raw = row.product_packaging;
    const packs = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const productSupplierId = (row as { supplier_id?: string | null }).supplier_id ?? null;
    const eligible = filterPackagingForCommandePurchase(
      packs as Parameters<typeof filterPackagingForCommandePurchase>[0],
      magasinId ?? null,
      commandSupplierId,
      productSupplierId,
    );
    const allowUnit = commandeAllowsUnitProduct(row.allow_unit_in_commande);
    if (eligible.length === 0 && !allowUnit) continue;
    out.push({
      ...row,
      product_packaging: eligible.length ? eligible : null,
    } as T);
  }
  return out;
}
