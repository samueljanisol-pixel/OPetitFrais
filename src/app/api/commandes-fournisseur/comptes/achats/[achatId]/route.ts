import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { computeLotCompteBreakdown } from "@/lib/commandes-fournisseur/compte-lot-breakdown";

type Ctx = { params: Promise<{ achatId: string }> };

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function itemKey(kind: string, vendeurId: string | null): string {
  if (kind === "vendeur" && vendeurId) return `vendeur:${vendeurId}`;
  return kind;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { achatId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();

  const { data: achat, error } = await supabase
    .from("fournisseur_compte_achat")
    .select(
      "id, lot_id, supplier_id, vendeur_id, kind, montant_total, date_cloture, ref_supplier(id, code, label), ref_supplier_vendeur(id, label)",
    )
    .eq("id", achatId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!achat) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const lotId = String((achat as { lot_id: string }).lot_id);
  const supplierId = String((achat as { supplier_id: string }).supplier_id);
  const kind = String((achat as { kind: string }).kind);
  const vendeurId = (achat as { vendeur_id?: string | null }).vendeur_id ?? null;

  const { data: paidLink } = await supabase
    .from("fournisseur_paiement_achat")
    .select("paiement_id")
    .eq("achat_id", achatId)
    .maybeSingle();

  const breakdown = await computeLotCompteBreakdown(supabase, lotId, supplierId);
  const key = itemKey(kind, vendeurId);
  const lignes =
    "lineDetailsByKey" in breakdown ? (breakdown.lineDetailsByKey.get(key) ?? []) : [];

  const sup = one((achat as { ref_supplier?: unknown }).ref_supplier) as {
    label?: string;
    code?: string;
  } | null;
  const vend = one((achat as { ref_supplier_vendeur?: unknown }).ref_supplier_vendeur) as {
    label?: string;
  } | null;

  let label = "";
  if (kind === "station") {
    label =
      (typeof sup?.label === "string" && sup.label.trim()) ||
      (typeof sup?.code === "string" && sup.code.trim()) ||
      "Fournisseur";
  } else {
    label = typeof vend?.label === "string" ? vend.label : "Vendeur";
  }

  const account_type = kind === "station" ? "station" : "vendeur";
  const account_id = kind === "station" ? supplierId : (vendeurId ?? supplierId);

  return NextResponse.json({
    achat: {
      id: achatId,
      lot_id: lotId,
      supplier_id: supplierId,
      supplier_label:
        (typeof sup?.label === "string" && sup.label.trim()) ||
        (typeof sup?.code === "string" && sup.code.trim()) ||
        "—",
      vendeur_id: vendeurId,
      kind,
      label,
      account_type,
      account_id,
      montant_total: Number((achat as { montant_total: number }).montant_total),
      date_cloture: (achat as { date_cloture: string }).date_cloture,
      paye: paidLink != null,
      paiement_id: paidLink ? String((paidLink as { paiement_id: string }).paiement_id) : null,
    },
    lignes,
  });
}
