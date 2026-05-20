import type { SupabaseClient } from "@supabase/supabase-js";

/** Vendeur produit si défini et cohérent avec le fournisseur du lot / produit. */
export async function vendeurIdForProduct(
  supabase: SupabaseClient,
  productId: string,
  supplierId: string,
): Promise<string | null> {
  const { data: product, error: pe } = await supabase
    .from("product")
    .select("vendeur_id, supplier_id")
    .eq("id", productId)
    .maybeSingle();
  if (pe || !product) {
    return null;
  }
  const row = product as { vendeur_id?: string | null; supplier_id: string };
  if (row.supplier_id !== supplierId) {
    return null;
  }
  const vid = row.vendeur_id?.trim();
  if (!vid) {
    return null;
  }
  const { data: vendeur, error: ve } = await supabase
    .from("ref_supplier_vendeur")
    .select("id")
    .eq("id", vid)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (ve || !vendeur) {
    return null;
  }
  return vid;
}

export async function vendeurIdsByProductIds(
  supabase: SupabaseClient,
  productIds: string[],
  supplierId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (productIds.length === 0) {
    return out;
  }
  const { data: products, error: pe } = await supabase
    .from("product")
    .select("id, vendeur_id, supplier_id")
    .in("id", productIds);
  if (pe || !products) {
    return out;
  }
  const candidateIds: string[] = [];
  for (const p of products) {
    const row = p as { id: string; vendeur_id?: string | null; supplier_id: string };
    if (row.supplier_id !== supplierId) {
      continue;
    }
    const vid = row.vendeur_id?.trim();
    if (vid) {
      candidateIds.push(vid);
    }
  }
  if (candidateIds.length === 0) {
    return out;
  }
  const { data: vendeurs, error: ve } = await supabase
    .from("ref_supplier_vendeur")
    .select("id")
    .in("id", [...new Set(candidateIds)])
    .eq("supplier_id", supplierId);
  if (ve || !vendeurs) {
    return out;
  }
  const validVendeur = new Set((vendeurs as { id: string }[]).map((v) => v.id));
  for (const p of products) {
    const row = p as { id: string; vendeur_id?: string | null; supplier_id: string };
    if (row.supplier_id !== supplierId) {
      continue;
    }
    const vid = row.vendeur_id?.trim();
    if (vid && validVendeur.has(vid)) {
      out.set(row.id, vid);
    }
  }
  return out;
}

/** Renseigne vendeur_id sur les lignes lot sans vendeur, depuis product.vendeur_id. */
export async function assignProductVendeursToLotLines(
  supabase: SupabaseClient,
  lotId: string,
  supplierId: string,
): Promise<string | null> {
  const { data: lignes, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id, product_id, vendeur_id")
    .eq("lot_id", lotId)
    .is("vendeur_id", null);
  if (le) {
    return le.message;
  }
  if (!lignes || lignes.length === 0) {
    return null;
  }

  const productIds = [
    ...new Set(
      (lignes as { product_id: string }[]).map((l) => l.product_id).filter(Boolean),
    ),
  ];
  const vendeurMap = await vendeurIdsByProductIds(supabase, productIds, supplierId);

  for (const ligne of lignes as { id: string; product_id: string }[]) {
    const vid = vendeurMap.get(ligne.product_id);
    if (!vid) {
      continue;
    }
    const { error: ue } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .update({ vendeur_id: vid })
      .eq("id", ligne.id)
      .is("vendeur_id", null);
    if (ue) {
      return ue.message;
    }
  }
  return null;
}
