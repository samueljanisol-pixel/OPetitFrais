import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lotLignePostgresUniqueKey,
  normalizeEntityId,
  normalizeProductPackagingId,
} from "@/lib/commandes-fournisseur/commande-ligne-key";

/** Ligne lot existante pour le même produit + conditionnement (clé index Postgres). */
export async function findExistingLotLigneId(
  supabase: SupabaseClient,
  lotId: string,
  productId: string,
  productPackagingId: string | null | undefined,
): Promise<{ id: string } | null> {
  const pid = normalizeEntityId(productId);
  if (!pid) {
    return null;
  }
  const targetKey = lotLignePostgresUniqueKey(pid, productPackagingId);

  const { data, error } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id, product_id, product_packaging_id")
    .eq("lot_id", lotId)
    .eq("product_id", pid);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const r = row as { id: string; product_id: string; product_packaging_id?: string | null };
    const key = lotLignePostgresUniqueKey(r.product_id, r.product_packaging_id);
    if (key === targetKey) {
      return { id: r.id };
    }
  }

  return null;
}
