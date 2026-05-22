import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Produits actifs ayant au moins un colis lié au fournisseur (réf. conditionnement ou product_packaging_supplier).
 */
export async function productIdsLinkedToCommandeSupplier(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: viaCond, error: e1 } = await supabase
    .from("product_packaging")
    .select("product_id, ref_conditionnement!inner(supplier_id)")
    .eq("ref_conditionnement.supplier_id", supplierId);
  if (!e1) {
    for (const row of viaCond ?? []) {
      const pid = (row as { product_id?: string }).product_id;
      if (pid) {
        ids.add(pid);
      }
    }
  }

  const { data: viaLink, error: e2 } = await supabase
    .from("product_packaging_supplier")
    .select("product_packaging!inner(product_id)")
    .eq("supplier_id", supplierId);
  if (!e2) {
    for (const row of viaLink ?? []) {
      const pp = (row as { product_packaging?: { product_id?: string } | { product_id?: string }[] })
        .product_packaging;
      const pack = Array.isArray(pp) ? pp[0] : pp;
      const pid = pack?.product_id;
      if (pid) {
        ids.add(pid);
      }
    }
  }

  return [...ids];
}
