import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { computeLotCompteBreakdown } from "@/lib/commandes-fournisseur/compte-lot-breakdown";
import { SUPPLIER_SOLE_VENDEUR_KEY } from "@/lib/commandes-fournisseur/achat-vendeur-key";
import { achatVendeurPhotoPublicUrl } from "@/lib/commandes-fournisseur/achat-vendeur-photos";
import { isLotVendeurMediaEditable } from "@/lib/commandes-fournisseur/lot-status-achat";
import { compteAchatDateIsoFromLivraison } from "@/lib/commandes-fournisseur/lot-commande-date";

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
      "id, lot_id, supplier_id, vendeur_id, kind, montant_total, date_cloture, commande_fournisseur_lot(date_livraison), ref_supplier(id, code, label), ref_supplier_vendeur(id, label)",
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
  const vendeurKey =
    kind === "station" || vendeurId == null ? SUPPLIER_SOLE_VENDEUR_KEY : String(vendeurId);

  const { data: paidLink } = await supabase
    .from("fournisseur_paiement_achat")
    .select("paiement_id")
    .eq("achat_id", achatId)
    .maybeSingle();

  const breakdown = await computeLotCompteBreakdown(supabase, lotId, supplierId);
  const key = itemKey(kind, vendeurId);
  const lignes =
    "lineDetailsByKey" in breakdown ? (breakdown.lineDetailsByKey.get(key) ?? []) : [];

  const [metaRes, photosRes] = await Promise.all([
    supabase
      .from("commande_fournisseur_lot_vendeur_achat")
      .select("commentaire")
      .eq("lot_id", lotId)
      .eq("vendeur_key", vendeurKey)
      .maybeSingle(),
    supabase
      .from("commande_fournisseur_lot_vendeur_photo")
      .select("id, storage_path, created_at")
      .eq("lot_id", lotId)
      .eq("vendeur_key", vendeurKey)
      .order("created_at", { ascending: true }),
  ]);

  if (metaRes.error) {
    return NextResponse.json({ error: metaRes.error.message }, { status: 500 });
  }
  if (photosRes.error) {
    return NextResponse.json({ error: photosRes.error.message }, { status: 500 });
  }

  const commentaireRaw = (metaRes.data as { commentaire?: string | null } | null)?.commentaire;
  const commentaire =
    typeof commentaireRaw === "string" && commentaireRaw.trim().length > 0
      ? commentaireRaw.trim()
      : null;

  const photos = (
    (photosRes.data ?? []) as Array<{
      id: string;
      storage_path: string;
      created_at: string;
    }>
  ).map((ph) => ({
    id: String(ph.id),
    storage_path: String(ph.storage_path),
    url: achatVendeurPhotoPublicUrl(supabase, String(ph.storage_path)),
    created_at: ph.created_at,
  }));

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

  const lotRel = one((achat as { commande_fournisseur_lot?: unknown }).commande_fournisseur_lot) as {
    date_livraison?: string | null;
  } | null;
  const dateLivraison =
    typeof lotRel?.date_livraison === "string" ? lotRel.date_livraison : null;

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
      date_cloture: compteAchatDateIsoFromLivraison(
        dateLivraison,
        (achat as { date_cloture: string }).date_cloture,
      ),
      paye: paidLink != null,
      paiement_id: paidLink ? String((paidLink as { paiement_id: string }).paiement_id) : null,
      commentaire,
    },
    lignes,
    photos,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { achatId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const commentaire =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { commentaire?: unknown }).commentaire === "string"
      ? (body as { commentaire: string }).commentaire
      : null;
  if (commentaire === null) {
    return NextResponse.json({ error: "commentaire requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: achat, error } = await supabase
    .from("fournisseur_compte_achat")
    .select("id, lot_id, vendeur_id, kind")
    .eq("id", achatId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!achat) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const lotId = String((achat as { lot_id: string }).lot_id);
  const kind = String((achat as { kind: string }).kind);
  const vendeurId = (achat as { vendeur_id?: string | null }).vendeur_id ?? null;
  const vendeurKey =
    kind === "station" || vendeurId == null ? SUPPLIER_SOLE_VENDEUR_KEY : String(vendeurId);

  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 });
  if (!lot) return NextResponse.json({ error: "Lot introuvable" }, { status: 404 });
  if (!isLotVendeurMediaEditable((lot as { status: string }).status)) {
    return NextResponse.json({ error: "Lot non modifiable" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const vendeurIdForRow = vendeurKey === SUPPLIER_SOLE_VENDEUR_KEY ? null : vendeurKey;

  const { data: existing } = await supabase
    .from("commande_fournisseur_lot_vendeur_achat")
    .select("vendeur_key")
    .eq("lot_id", lotId)
    .eq("vendeur_key", vendeurKey)
    .maybeSingle();

  if (existing) {
    const { data, error: ue } = await supabase
      .from("commande_fournisseur_lot_vendeur_achat")
      .update({ commentaire, updated_at: now })
      .eq("lot_id", lotId)
      .eq("vendeur_key", vendeurKey)
      .select("commentaire")
      .maybeSingle();
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      commentaire:
        typeof (data as { commentaire?: string | null } | null)?.commentaire === "string"
          ? (data as { commentaire: string }).commentaire
          : commentaire,
    });
  }

  const { data, error: ie } = await supabase
    .from("commande_fournisseur_lot_vendeur_achat")
    .insert({
      lot_id: lotId,
      vendeur_key: vendeurKey,
      vendeur_id: vendeurIdForRow,
      status: "ouvert",
      commentaire,
      updated_at: now,
    })
    .select("commentaire")
    .maybeSingle();
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    commentaire:
      typeof (data as { commentaire?: string | null } | null)?.commentaire === "string"
        ? (data as { commentaire: string }).commentaire
        : commentaire,
  });
}
