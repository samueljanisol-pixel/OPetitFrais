import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { findExistingLotLigneId } from "@/lib/commandes-fournisseur/lot-ligne-duplicate-query";
import { vendeurIdForProduct } from "@/lib/commandes-fournisseur/product-vendeur";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ajoute un produit au lot « prêt » (achat) : ligne sans vendeur, besoin figé à 0, qté achat 0.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: lotId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { productId?: string; productPackagingId?: string | null };
  try {
    body = (await req.json()) as { productId?: string; productPackagingId?: string | null };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  let packagingId: string | null = null;
  if (body.productPackagingId !== undefined && body.productPackagingId !== null) {
    const raw = String(body.productPackagingId).trim();
    if (raw.length > 0) {
      packagingId = raw;
    }
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
  if (st !== "prete") {
    return NextResponse.json({ error: "Seul un lot « prêt » peut recevoir un produit" }, { status: 409 });
  }
  const lotSupplierId = (lot as { supplier_id: string }).supplier_id;

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

  const ps = (product as { supplier_id: string }).supplier_id;
  if (ps !== lotSupplierId) {
    return NextResponse.json({ error: "Ce produit n'appartient pas au fournisseur du lot" }, { status: 400 });
  }

  if (packagingId) {
    const { data: row, error: pkgE } = await supabase
      .from("product_packaging")
      .select("id")
      .eq("id", packagingId)
      .eq("product_id", productId)
      .maybeSingle();
    if (pkgE) {
      return NextResponse.json({ error: pkgE.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Conditionnement invalide pour ce produit" }, { status: 400 });
    }
  }

  let dup: { id: string } | null;
  try {
    dup = await findExistingLotLigneId(supabase, lotId, productId, packagingId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 },
    );
  }
  if (dup) {
    return NextResponse.json(
      { error: "Ce conditionnement est déjà dans le lot" },
      { status: 409 },
    );
  }

  const vendeurId = await vendeurIdForProduct(supabase, productId, lotSupplierId);

  const { data: inserted, error: insL } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .insert({
      lot_id: lotId,
      product_id: productId,
      product_packaging_id: packagingId,
      qte_achat: 0,
      qte_besoin_fige: 0,
      vendeur_id: vendeurId,
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

  return NextResponse.json({ ok: true, lotLigneId });
}
