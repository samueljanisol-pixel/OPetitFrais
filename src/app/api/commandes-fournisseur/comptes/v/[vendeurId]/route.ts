import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  loadAchatsForAccount,
  loadPaiementsForAccount,
  summarizeAchats,
} from "@/lib/commandes-fournisseur/compte-queries";

type Ctx = { params: Promise<{ vendeurId: string }> };

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { vendeurId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();

  const { data: vendeur, error: ve } = await supabase
    .from("ref_supplier_vendeur")
    .select("id, label, supplier_id, ref_supplier(id, code, label)")
    .eq("id", vendeurId)
    .maybeSingle();

  if (ve) {
    return NextResponse.json({ error: ve.message }, { status: 500 });
  }
  if (!vendeur) {
    return NextResponse.json({ error: "Vendeur introuvable" }, { status: 404 });
  }

  const account = { type: "vendeur" as const, vendeurId };
  const [achatsRes, paiementsRes] = await Promise.all([
    loadAchatsForAccount(supabase, account),
    loadPaiementsForAccount(supabase, account),
  ]);

  if ("error" in achatsRes) {
    return NextResponse.json({ error: achatsRes.error }, { status: 500 });
  }
  if ("error" in paiementsRes) {
    return NextResponse.json({ error: paiementsRes.error }, { status: 500 });
  }

  const sup = one((vendeur as { ref_supplier?: unknown }).ref_supplier) as {
    label?: string;
    code?: string;
  } | null;
  const parentLabel =
    (typeof sup?.label === "string" && sup.label.trim()) ||
    (typeof sup?.code === "string" && sup.code.trim()) ||
    "—";

  const achats = achatsRes.achats.map((a) => ({
    ...a,
    label: typeof (vendeur as { label: string }).label === "string" ? (vendeur as { label: string }).label : "Vendeur",
  }));

  const totals = summarizeAchats(achatsRes.achats);

  return NextResponse.json({
    account: {
      account_type: "vendeur" as const,
      account_id: vendeurId,
      label: String((vendeur as { label: string }).label),
      parent_supplier_label: parentLabel,
      supplier_id: String((vendeur as { supplier_id: string }).supplier_id),
    },
    achats,
    paiements: paiementsRes.paiements,
    totals,
  });
}
