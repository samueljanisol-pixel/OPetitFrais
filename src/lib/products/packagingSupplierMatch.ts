/** Fournisseur porté par le référentiel conditionnement (ref_conditionnement.supplier_id). */
export function conditionnementSupplierId(ref: unknown): string | null {
  const o = (Array.isArray(ref) ? ref[0] : ref) as { supplier_id?: string | null } | null | undefined;
  const id = o?.supplier_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function packagingSupplierIdsFromLinks(
  raw: Array<{ supplier_id?: string | null }> | { supplier_id?: string | null } | null | undefined,
): string[] {
  if (raw == null) {
    return [];
  }
  const rows = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const r of rows) {
    const id = r.supplier_id;
    if (typeof id === "string" && id.length > 0) {
      out.push(id);
    }
  }
  return out;
}

export type PackagingWithSupplierLinks = {
  ref_conditionnement?: unknown;
  product_packaging_supplier?: Array<{ supplier_id?: string | null }> | null;
};

/**
 * Colis visible pour une commande fournisseur :
 * - produit déjà rattaché au fournisseur de la commande → tous les colis achetables ;
 * - sinon colis dont le conditionnement réf. ou les liaisons product_packaging_supplier ciblent ce fournisseur ;
 * - ou colis « génériques » (pas de fournisseur sur le réf. ni liaison explicite).
 */
export function packagingMatchesCommandeSupplier(
  pkg: PackagingWithSupplierLinks,
  commandSupplierId: string | null | undefined,
  productSupplierId: string | null | undefined,
): boolean {
  if (!commandSupplierId) {
    return true;
  }
  if (productSupplierId === commandSupplierId) {
    return true;
  }
  const condSid = conditionnementSupplierId(pkg.ref_conditionnement);
  const linked = packagingSupplierIdsFromLinks(pkg.product_packaging_supplier);
  if (condSid === commandSupplierId) {
    return true;
  }
  if (linked.includes(commandSupplierId)) {
    return true;
  }
  if (!condSid && linked.length === 0) {
    return true;
  }
  return false;
}
