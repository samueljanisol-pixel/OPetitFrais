import type { SupabaseClient } from "@supabase/supabase-js";

export type LotLigneVendeurPatch = {
  lotLigneId: string;
  vendeur_id: string | null;
};

export async function vendorBelongsSupplier(
  supabase: SupabaseClient,
  vendeurId: string,
  supplierId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ref_supplier_vendeur")
    .select("id")
    .eq("id", vendeurId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (error || !data) {
    return false;
  }
  return true;
}

/** Met à jour vendeur_id sur des lignes lot (validation ou achat). */
export async function applyLotLigneVendeurUpdates(
  supabase: SupabaseClient,
  lotId: string,
  supplierId: string,
  updates: LotLigneVendeurPatch[],
): Promise<string | null> {
  for (const u of updates) {
    if (typeof u.lotLigneId !== "string" || u.lotLigneId.trim().length === 0) {
      return "lotLigneId invalide";
    }
    if (u.vendeur_id !== null && typeof u.vendeur_id !== "string") {
      return "vendeur_id invalide";
    }

    const { data: ligne, error: le } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .select("id, lot_id, product_id, vendeur_id")
      .eq("id", u.lotLigneId)
      .maybeSingle();
    if (le) {
      return le.message;
    }
    if (!ligne) {
      return "Ligne introuvable";
    }
    const rowLotId = (ligne as { lot_id: string }).lot_id;
    if (rowLotId !== lotId) {
      return "Ligne hors lot";
    }

    const nextVendeur =
      u.vendeur_id === null
        ? null
        : u.vendeur_id.trim().length > 0
          ? u.vendeur_id.trim()
          : null;

    if (nextVendeur != null) {
      const ok = await vendorBelongsSupplier(supabase, nextVendeur, supplierId);
      if (!ok) {
        return "Vendeur invalide pour ce fournisseur";
      }
    }

    const currentVendeur = (ligne as { vendeur_id?: string | null }).vendeur_id ?? null;
    if (currentVendeur === nextVendeur) {
      continue;
    }

    const { error: ue } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .update({ vendeur_id: nextVendeur })
      .eq("id", u.lotLigneId);
    if (ue) {
      return ue.message;
    }

    if (nextVendeur != null) {
      const productId = String((ligne as { product_id: string }).product_id);
      const pe = await setProductLastVendeur(supabase, {
        productId,
        supplierId,
        vendeurId: nextVendeur,
      });
      if (pe) {
        return pe;
      }
    }
  }
  return null;
}

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

/**
 * Enregistre le dernier vendeur sur la fiche produit (même fournisseur).
 * Ne vide pas `product.vendeur_id` si `vendeurId` est null.
 */
export async function setProductLastVendeur(
  supabase: SupabaseClient,
  opts: { productId: string; supplierId: string; vendeurId: string },
): Promise<string | null> {
  const productId = opts.productId.trim();
  const vendeurId = opts.vendeurId.trim();
  if (!productId || !vendeurId) return null;

  const { data: product, error: pe } = await supabase
    .from("product")
    .select("id, supplier_id, vendeur_id")
    .eq("id", productId)
    .maybeSingle();
  if (pe) return pe.message;
  if (!product) return null;
  const row = product as { id: string; supplier_id: string; vendeur_id?: string | null };
  if (row.supplier_id !== opts.supplierId) return null;

  const { data: vendeur, error: ve } = await supabase
    .from("ref_supplier_vendeur")
    .select("id")
    .eq("id", vendeurId)
    .eq("supplier_id", opts.supplierId)
    .maybeSingle();
  if (ve) return ve.message;
  if (!vendeur) return "Vendeur invalide pour ce fournisseur";

  if (row.vendeur_id === vendeurId) return null;

  const { error: ue } = await supabase
    .from("product")
    .update({ vendeur_id: vendeurId })
    .eq("id", productId)
    .eq("supplier_id", opts.supplierId);
  if (ue) return ue.message;
  return null;
}
