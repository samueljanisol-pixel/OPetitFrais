import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ajoute un produit au lot brouillon (ligne + qtés par magasin des commandes incluses à 0).
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: lotId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { productId?: string };
  try {
    body = (await req.json()) as { productId?: string };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: lot, error: le } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, supplier_id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (le) {
    return NextResponse.json({ error: le.message }, { status: 500 });
  }
  if (!lot) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  const st = (lot as { status: string }).status;
  if (st !== "brouillon") {
    return NextResponse.json({ error: "Seul un lot brouillon peut être modifié" }, { status: 409 });
  }

  const { data: product, error: pe } = await supabase
    .from("product")
    .select("id, supplier_id, active")
    .eq("id", productId)
    .maybeSingle();
  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 500 });
  }
  if (!product) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }
  if (!(product as { active: boolean }).active) {
    return NextResponse.json({ error: "Produit inactif" }, { status: 400 });
  }
  const { data: dup, error: dupE } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id")
    .eq("lot_id", lotId)
    .eq("product_id", productId)
    .maybeSingle();
  if (dupE) {
    return NextResponse.json({ error: dupE.message }, { status: 500 });
  }
  if (dup) {
    return NextResponse.json({ error: "Ce produit est déjà dans le lot" }, { status: 409 });
  }

  const { data: incRows, error: ie } = await supabase
    .from("commande_fournisseur_lot_inclusion")
    .select("commande_fournisseur(magasin_id)")
    .eq("lot_id", lotId);
  if (ie) {
    return NextResponse.json({ error: ie.message }, { status: 500 });
  }

  const magIds = new Set<string>();
  for (const row of incRows ?? []) {
    const cf = (row as { commande_fournisseur?: { magasin_id: string } | { magasin_id: string }[] | null })
      .commande_fournisseur;
    const c = Array.isArray(cf) ? cf[0] : cf;
    const mid = c?.magasin_id;
    if (typeof mid === "string") {
      magIds.add(mid);
    }
  }

  const { data: inserted, error: insL } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .insert({
      lot_id: lotId,
      product_id: productId,
      qte_achat: 0,
    })
    .select("id")
    .single();
  if (insL) {
    return NextResponse.json({ error: insL.message }, { status: 500 });
  }
  const lotLigneId = inserted?.id as string | undefined;
  if (!lotLigneId) {
    return NextResponse.json({ error: "Insertion ligne lot impossible" }, { status: 500 });
  }

  if (magIds.size > 0) {
    const magRows = [...magIds].map((magasin_id) => ({
      lot_ligne_id: lotLigneId,
      magasin_id,
      qte: 0,
    }));
    const { error: mi } = await supabase.from("commande_fournisseur_lot_ligne_magasin").insert(magRows);
    if (mi) {
      await supabase.from("commande_fournisseur_lot_ligne").delete().eq("id", lotLigneId);
      return NextResponse.json({ error: mi.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, lotLigneId });
}
