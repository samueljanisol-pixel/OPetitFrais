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
 * Colis visible pour une commande fournisseur **F** :
 * - conditionnement réf. (`ref_conditionnement.supplier_id`) = **F**, ou
 * - liaison `product_packaging_supplier` vers **F**.
 * Les colis sans lien fournisseur ou liés à un autre fournisseur sont exclus.
 */
export function packagingMatchesCommandeSupplier(
  pkg: PackagingWithSupplierLinks,
  commandSupplierId: string | null | undefined,
  _productSupplierId?: string | null | undefined,
): boolean {
  if (!commandSupplierId) {
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
  return false;
}
