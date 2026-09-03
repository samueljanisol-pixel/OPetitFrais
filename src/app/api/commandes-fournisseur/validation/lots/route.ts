import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { createValidationLot } from "@/lib/commandes-fournisseur/create-validation-lot";

/** Liste des lots (validation / achat). */
export async function GET() {
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: lots, error } = await supabase
    .from("commande_fournisseur_lot")
    .select(
      "id, supplier_id, status, created_at, date_livraison, marque_prete_at, ref_supplier(id, code, label)",
    )
    .in("status", ["brouillon", "prevalidation", "prete", "achat_en_cours", "terminee"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lots: lots ?? [] });
}

/** Création d’un lot à partir de commandes validées (même fournisseur). */
export async function POST(req: Request) {
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { commandeIds?: string[] };
  try {
    body = (await req.json()) as { commandeIds?: string[] };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const commandeIds = body.commandeIds ?? [];
  if (!Array.isArray(commandeIds) || commandeIds.length === 0) {
    return NextResponse.json({ error: "commandeIds requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const res = await createValidationLot(supabase, gate.userId, commandeIds);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ lotId: res.lotId });
}
