import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { syncCompteAchatsForLot } from "@/lib/commandes-fournisseur/compte-lot-breakdown";
import { compteAchatDateIsoFromLivraison } from "@/lib/commandes-fournisseur/lot-commande-date";

/** Recalcule les achats comptables pour tous les lots terminés (produits seuls, sans frais). */
export async function POST() {
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();

  const { data: lots, error } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, supplier_id, date_livraison, marque_terminee_at")
    .eq("status", "terminee");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let synced = 0;
  const errors: string[] = [];

  for (const lot of lots ?? []) {
    const lotId = String((lot as { id: string }).id);
    const supplierId = String((lot as { supplier_id: string }).supplier_id);
    const fallback =
      (lot as { marque_terminee_at?: string | null }).marque_terminee_at ?? new Date().toISOString();
    const dateCloture = compteAchatDateIsoFromLivraison(
      (lot as { date_livraison?: string | null }).date_livraison,
      fallback,
    );

    const sync = await syncCompteAchatsForLot(supabase, { lotId, supplierId, dateCloture });
    if ("error" in sync) {
      errors.push(`${lotId}: ${sync.error}`);
    } else {
      synced += 1;
    }
  }

  return NextResponse.json({ ok: true, synced, errors });
}
