import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProductPackagingId } from "@/lib/commandes-fournisseur/commande-ligne-key";

/** Ligne lot existante pour le même produit + conditionnement. */
export async function findExistingLotLigneId(
  supabase: SupabaseClient,
  lotId: string,
  productId: string,
  productPackagingId: string | null | undefined,
): Promise<{ id: string } | null> {
  const packagingId = normalizeProductPackagingId(productPackagingId);
  let q = supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id")
    .eq("lot_id", lotId)
    .eq("product_id", productId);
  if (packagingId) {
    q = q.eq("product_packaging_id", packagingId);
  } else {
    q = q.is("product_packaging_id", null);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data as { id: string } | null;
}
