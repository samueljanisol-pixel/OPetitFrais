import type { SupabaseClient } from "@supabase/supabase-js";

export const LOT_STATUS_PREVALIDATION = "prevalidation" as const;
export const LOT_STATUS_ACHAT_EN_COURS = "achat_en_cours" as const;

/** Statuts où la saisie / clôture vendeur achat est possible. */
export function isLotAchatEditable(status: string): boolean {
  return status === "prete" || status === "achat_en_cours";
}

/** Commentaire / photos encore gérables (y compris lot terminé, côté comptes). */
export function isLotVendeurMediaEditable(status: string): boolean {
  return status === "prete" || status === "achat_en_cours" || status === "terminee";
}

/** Lot encore « ouvert » côté validation (exports WhatsApp, pas brouillon). */
export function isLotPretOrAchatEnCours(status: string): boolean {
  return status === "prete" || status === "achat_en_cours";
}

/** Prévalidation ou phase post-prévalidation (récap consolidation). */
export function isLotPrevalidationOrPretOrAchatEnCours(status: string): boolean {
  return status === LOT_STATUS_PREVALIDATION || isLotPretOrAchatEnCours(status);
}

/** Édition matrice consolidation : brouillon (tous) ou prévalidation (administrateur). */
export function isLotConsolidationEditable(status: string, isAdministrator: boolean): boolean {
  if (status === "brouillon") {
    return true;
  }
  if (status === LOT_STATUS_PREVALIDATION) {
    return isAdministrator;
  }
  return false;
}

/**
 * Passe le lot de `prete` → `achat_en_cours` (no-op si déjà dans un autre statut).
 */
export async function ensureLotAchatEnCours(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string } | { ok: true; changed: boolean }> {
  const { data, error } = await supabase
    .from("commande_fournisseur_lot")
    .update({ status: LOT_STATUS_ACHAT_EN_COURS })
    .eq("id", lotId)
    .eq("status", "prete")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  return { ok: true, changed: data != null };
}
