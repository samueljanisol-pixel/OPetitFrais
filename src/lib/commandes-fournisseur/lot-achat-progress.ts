import type { SupabaseClient } from "@supabase/supabase-js";

type AchatLineProgress = {
  qte_achat?: number | null;
  prix_achat_unitaire?: number | null;
  montant_ligne_achat?: number | null;
  marque_achete?: boolean | null;
};

/** True si au moins une ligne montre une saisie achat (qté, prix, montant ou marque). */
export function linesShowAchatProgress(lignes: AchatLineProgress[]): boolean {
  for (const L of lignes) {
    const qte = Number(L.qte_achat) || 0;
    if (qte > 0) return true;
    const pu = L.prix_achat_unitaire;
    if (pu !== null && pu !== undefined && Number.isFinite(Number(pu))) {
      return true;
    }
    const montant = L.montant_ligne_achat;
    if (montant !== null && montant !== undefined && Number(montant) !== 0) {
      return true;
    }
    if (L.marque_achete === true) return true;
  }
  return false;
}

/**
 * True si l’acheteur a déjà commencé la saisie sur ce lot
 * (lignes : qté / prix / montant / marque — lisibles en consolidation).
 */
export async function lotHasAchatProgress(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string } | { started: boolean }> {
  const { data, error } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("qte_achat, prix_achat_unitaire, montant_ligne_achat, marque_achete")
    .eq("lot_id", lotId);

  if (error) return { error: error.message };
  return { started: linesShowAchatProgress((data ?? []) as AchatLineProgress[]) };
}
