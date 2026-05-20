/**
 * Déduit le conditionnement saisi (commande_fournisseur_ligne.product_packaging_id)
 * pour un produit agrégé dans un lot.
 */

/** Une seule valeur distincte → cette valeur ; plusieurs conditionnements → null. */
export function resolvePackagingIdFromSaisieRows(
  packagingIds: Iterable<string | null | undefined>,
): string | null {
  const distinct = new Set<string | null>();
  for (const raw of packagingIds) {
    distinct.add(typeof raw === "string" && raw.length > 0 ? raw : null);
  }
  if (distinct.size !== 1) {
    return null;
  }
  const [only] = distinct;
  return only;
}

export async function packagingIdByProductFromCommandeLignes(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  commandeIds: string[],
  productIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (commandeIds.length === 0 || productIds.length === 0) {
    return out;
  }

  const { data: lignes, error } = await supabase
    .from("commande_fournisseur_ligne")
    .select("product_id, product_packaging_id")
    .in("commande_id", commandeIds)
    .in("product_id", productIds);

  if (error || !lignes) {
    return out;
  }

  const byProduct = new Map<string, Set<string | null>>();
  for (const row of lignes) {
    const pid = (row as { product_id?: string }).product_id;
    if (!pid) continue;
    const packId = (row as { product_packaging_id?: string | null }).product_packaging_id ?? null;
    let set = byProduct.get(pid);
    if (!set) {
      set = new Set();
      byProduct.set(pid, set);
    }
    set.add(typeof packId === "string" && packId.length > 0 ? packId : null);
  }

  for (const [pid, set] of byProduct) {
    out.set(pid, resolvePackagingIdFromSaisieRows(set));
  }

  return out;
}
