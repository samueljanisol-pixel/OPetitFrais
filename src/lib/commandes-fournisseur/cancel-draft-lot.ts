import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lot « brouillon » : supprime le lot et ses agrégats, remet les commandes en « validée » (hors lot).
 * Transaction logique : d’abord les commandes (statut + lot_id), puis suppression du lot (CASCADE).
 */
export async function cancelDraftLot(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ ok: true } | { error: string }> {
  const { data: lot, error: le } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();

  if (le) {
    return { error: le.message };
  }
  if (!lot) {
    return { error: "Lot introuvable" };
  }
  if (lot.status !== "brouillon") {
    return { error: "Seul un lot au statut « brouillon » peut être annulé" };
  }

  const { error: u1 } = await supabase
    .from("commande_fournisseur")
    .update({ status: "validee", lot_id: null })
    .eq("lot_id", lotId);

  if (u1) {
    return { error: u1.message };
  }

  const { error: d1 } = await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
  if (d1) {
    return { error: d1.message };
  }

  return { ok: true };
}
