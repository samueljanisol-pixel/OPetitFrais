import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

/** Commandes validées, pas encore rattachées à un lot (validation fournisseur). */
export async function GET() {
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("commande_fournisseur")
    .select(
      "id, created_at, validated_at, date_livraison, magasin_id, supplier_id, ref_supplier(id, code, label), magasins(id, code, nom), commande_fournisseur_ligne(id, qte)",
    )
    .eq("status", "validee")
    .is("lot_id", null)
    .order("validated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []).map((r) => {
    const ll = (r as { commande_fournisseur_ligne?: { id: string; qte: number }[] | null }).commande_fournisseur_ligne;
    const arr = Array.isArray(ll) ? ll : ll ? [ll] : [];
    const lineCount = arr.length;
    const qteTotal = arr.reduce((s, x) => s + (Number(x.qte) || 0), 0);
    const { commande_fournisseur_ligne: _drop, ...rest } = r as Record<string, unknown>;
    return { ...rest, lineCount, qteTotal };
  });

  return NextResponse.json({ commandes: list });
}
