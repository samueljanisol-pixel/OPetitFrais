import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

/**
 * Liste des lots achetables / terminés (vue achete).
 */
export async function GET(req: Request) {
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const allowed = new Set(["prete", "terminee", "all"]);
  const mode =
    statusParam && allowed.has(statusParam) ? statusParam : "prete";
  /** Filtre « en attente » = prêt + achat en cours. */
  const statuses =
    mode === "all"
      ? (["prete", "achat_en_cours", "terminee"] as const)
      : mode === "prete"
        ? (["prete", "achat_en_cours"] as const)
        : ([mode] as const);

  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from("commande_fournisseur_lot")
    .select("id, supplier_id, status, marque_prete_at, marque_terminee_at, created_at, ref_supplier(id, code, label)")
    .in("status", [...statuses])
    .order("marque_prete_at", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: lots, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lots: lots ?? [] });
}
