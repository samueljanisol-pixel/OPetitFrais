import type { SupabaseClient } from "@supabase/supabase-js";

type AchatLineProgress = {
  qte_achat?: number | null;
  prix_achat_unitaire?: number | null;
  montant_ligne_achat?: number | null;
  marque_achete?: boolean | null;
};

function lineHasAchatPricingOrMarque(L: AchatLineProgress): boolean {
  if (L.marque_achete === true) return true;
  const pu = L.prix_achat_unitaire;
  if (pu !== null && pu !== undefined && Number.isFinite(Number(pu))) {
    return true;
  }
  const montant = L.montant_ligne_achat;
  if (montant !== null && montant !== undefined && Number(montant) !== 0) {
    return true;
  }
  return false;
}

/** True si au moins une ligne montre une saisie achat (qté, prix, montant ou marque). */
export function linesShowAchatProgress(lignes: AchatLineProgress[]): boolean {
  for (const L of lignes) {
    const qte = Number(L.qte_achat) || 0;
    if (qte > 0) return true;
    if (lineHasAchatPricingOrMarque(L)) return true;
  }
  return false;
}

/**
 * True si le retour en consolidation (brouillon) doit être refusé :
 * saisie achat réelle (prix / marque / montant), ou qté achat une fois le lot passé en achat_en_cours.
 * En statut `prete`, une qté > 0 seule (total consolidation non vidé) ne bloque pas.
 */
export function consolidationReopenBlocked(
  lotStatus: string,
  lignes: AchatLineProgress[],
): boolean {
  if (lotStatus !== "prete" && lotStatus !== "achat_en_cours") {
    return true;
  }
  for (const L of lignes) {
    if (lineHasAchatPricingOrMarque(L)) return true;
  }
  if (lotStatus === "achat_en_cours") {
    for (const L of lignes) {
      if ((Number(L.qte_achat) || 0) > 0) return true;
    }
  }
  return false;
}

export function canReopenConsolidationBrouillon(
  lotStatus: string,
  lignes: AchatLineProgress[],
): boolean {
  if (lotStatus !== "prete" && lotStatus !== "achat_en_cours") {
    return false;
  }
  return !consolidationReopenBlocked(lotStatus, lignes);
}

/**
 * True si l’acheteur a déjà commencé la saisie sur ce lot
 * (lignes : qté / prix / montant / marque — lisibles en consolidation).
 */
export async function lotHasAchatProgress(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string } | { started: boolean }> {
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return { error: lotErr.message };
  const lotStatus = (lot as { status?: string } | null)?.status ?? "";

  const { data, error } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("qte_achat, prix_achat_unitaire, montant_ligne_achat, marque_achete")
    .eq("lot_id", lotId);

  if (error) return { error: error.message };
  const lignes = (data ?? []) as AchatLineProgress[];
  if (lotStatus === "prete" || lotStatus === "achat_en_cours") {
    return { started: consolidationReopenBlocked(lotStatus, lignes) };
  }
  return { started: linesShowAchatProgress(lignes) };
}
