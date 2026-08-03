import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SalariePaiementRow,
  SalariePaiementSummary,
} from "@/lib/salaries/types";

export function computePaiementSummary(rows: Pick<SalariePaiementRow, "kind" | "montant">[]): SalariePaiementSummary {
  let total_salaires = 0;
  let total_avances = 0;
  for (const row of rows) {
    if (row.kind === "salaire") total_salaires += row.montant;
    else total_avances += row.montant;
  }
  return {
    total_salaires,
    total_avances,
    solde: total_salaires - total_avances,
  };
}

export async function loadPaiementsForSalarie(
  supabase: SupabaseClient,
  salarieId: string,
): Promise<{ error: string } | { paiements: SalariePaiementRow[]; summary: SalariePaiementSummary }> {
  const { data, error } = await supabase
    .from("salarie_paiement")
    .select(
      "id, salarie_id, kind, montant, date_paiement, payment_method_id, commentaire, created_at, ref_payment_method(label)",
    )
    .eq("salarie_id", salarieId)
    .order("date_paiement", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };

  const paiements: SalariePaiementRow[] = (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      salarie_id: string;
      kind: SalariePaiementRow["kind"];
      montant: number | string;
      date_paiement: string;
      payment_method_id: string | null;
      commentaire: string | null;
      created_at: string;
      ref_payment_method: { label: string } | { label: string }[] | null;
    };
    const pmRaw = row.ref_payment_method;
    const pm = pmRaw == null ? null : Array.isArray(pmRaw) ? pmRaw[0] : pmRaw;
    return {
      id: row.id,
      salarie_id: row.salarie_id,
      kind: row.kind,
      montant: Number(row.montant),
      date_paiement: row.date_paiement,
      payment_method_id: row.payment_method_id,
      payment_method_label: pm?.label ?? null,
      commentaire: row.commentaire,
      created_at: row.created_at,
    };
  });

  return { paiements, summary: computePaiementSummary(paiements) };
}
