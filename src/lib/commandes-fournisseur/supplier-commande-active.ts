import type { SupabaseClient } from "@supabase/supabase-js";

/** Vérifie que le fournisseur accepte les commandes magasin (`ref_supplier.commande_active`). */
export async function isSupplierCommandeActive(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ref_supplier")
    .select("commande_active")
    .eq("id", supplierId)
    .maybeSingle();
  if (error || !data) return false;
  return data.commande_active !== false;
}

export const SUPPLIER_COMMANDE_INACTIVE_MSG = "Les commandes sont désactivées pour ce fournisseur.";
