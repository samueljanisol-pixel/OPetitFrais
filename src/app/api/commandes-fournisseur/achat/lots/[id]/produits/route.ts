import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { findExistingLotLigneId } from "@/lib/commandes-fournisseur/lot-ligne-duplicate-query";
import { insertLotLignesMerged } from "@/lib/commandes-fournisseur/insert-lot-lignes";
import { normalizeEntityId, normalizeProductPackagingId } from "@/lib/commandes-fournisseur/commande-ligne-key";
import { vendeurIdForProduct } from "@/lib/commandes-fournisseur/product-vendeur";
import { productBelongsToSupplier } from "@/lib/products/product-supplier";
import {
  ensureLotAchatEnCours,
  isLotAchatEditable,
} from "@/lib/commandes-fournisseur/lot-status-achat";

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
  const productIdNorm = normalizeEntityId(productId);
  if (!productIdNorm) {
    return NextResponse.json({ error: "productId invalide" }, { status: 400 });
  }

  let packagingId: string | null = null;
  if (body.productPackagingId !== undefined && body.productPackagingId !== null) {
    packagingId = normalizeProductPackagingId(String(body.productPackagingId).trim());
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
  if (!isLotAchatEditable(st)) {
    return NextResponse.json(
      { error: "Seul un lot « prêt » ou « achat en cours » peut recevoir un produit" },
      { status: 409 },
    );
  }
  const marked = await ensureLotAchatEnCours(supabase, lotId);
  if ("error" in marked) {
    return NextResponse.json({ error: marked.error }, { status: 500 });
  }
  const lotSupplierId = (lot as { supplier_id: string }).supplier_id;

  const { data: product, error: pe } = await supabase
    .from("product")
    .select("id, active")
    .eq("id", productIdNorm)
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

  let belongs = false;
  try {
    belongs = await productBelongsToSupplier(supabase, productIdNorm, lotSupplierId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur vérification fournisseur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!belongs) {
    return NextResponse.json({ error: "Ce produit n'appartient pas au fournisseur du lot" }, { status: 400 });
  }

  if (packagingId) {
    const { data: row, error: pkgE } = await supabase
      .from("product_packaging")
      .select("id")
      .eq("id", packagingId)
      .eq("product_id", productIdNorm)
      .is("archived_at", null)
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
    dup = await findExistingLotLigneId(supabase, lotId, productIdNorm, packagingId);
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

  const vendeurId = await vendeurIdForProduct(supabase, productIdNorm, lotSupplierId);

  let writeSupabase;
  try {
    writeSupabase = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  const insRes = await insertLotLignesMerged(writeSupabase, lotId, [
    {
      lot_id: lotId,
      product_id: productIdNorm,
      product_packaging_id: packagingId,
      qte_achat: 0,
      ...(vendeurId ? { vendeur_id: vendeurId } : {}),
    },
  ]);
  if ("error" in insRes) {
    if (insRes.error.includes("déjà") || insRes.error.includes("doublon")) {
      return NextResponse.json({ error: "Ce conditionnement est déjà dans le lot." }, { status: 409 });
    }
    return NextResponse.json({ error: insRes.error }, { status: 500 });
  }
  const lotLigneId = [...insRes.keyToLotLigneId.values()][0];
  if (!lotLigneId) {
    return NextResponse.json({ error: "Insertion ligne lot impossible" }, { status: 500 });
  }

  const { error: figeErr } = await writeSupabase
    .from("commande_fournisseur_lot_ligne")
    .update({ qte_besoin_fige: 0 })
    .eq("id", lotLigneId);
  if (figeErr) {
    return NextResponse.json({ error: figeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lotLigneId });
}
