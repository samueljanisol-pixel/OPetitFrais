import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  cloturerVendeurAchat,
  rouvrirVendeurAchat,
  vendeurAchatIsPaid,
} from "@/lib/commandes-fournisseur/achat-vendeur-cloture";
import { SUPPLIER_SOLE_VENDEUR_KEY } from "@/lib/commandes-fournisseur/achat-vendeur-key";
import {
  ensureLotAchatEnCours,
  isLotAchatEditable,
} from "@/lib/commandes-fournisseur/lot-status-achat";

type Ctx = { params: Promise<{ id: string; vendeurKey: string }> };

function decodeKey(raw: string): string {
  return decodeURIComponent(raw);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: lotId, vendeurKey: rawKey } = await ctx.params;
  const vendeurKey = decodeKey(rawKey);
  const gate = await requireApiPermission("commandes_fournisseur.achat");
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
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 });
  if (!lot) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!isLotAchatEditable((lot as { status: string }).status)) {
    return NextResponse.json({ error: "Lot non modifiable" }, { status: 409 });
  }

  const vendeurId = vendeurKey === SUPPLIER_SOLE_VENDEUR_KEY ? null : vendeurKey;
  const now = new Date().toISOString();

  const marked = await ensureLotAchatEnCours(supabase, lotId);
  if ("error" in marked) {
    return NextResponse.json({ error: marked.error }, { status: 500 });
  }

  const { data: existing } = await supabase
    .from("commande_fournisseur_lot_vendeur_achat")
    .select("vendeur_key, status")
    .eq("lot_id", lotId)
    .eq("vendeur_key", vendeurKey)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("commande_fournisseur_lot_vendeur_achat")
      .update({ commentaire, updated_at: now })
      .eq("lot_id", lotId)
      .eq("vendeur_key", vendeurKey)
      .select("lot_id, vendeur_key, status, commentaire, marque_cloture_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("commande_fournisseur_lot_vendeur_achat")
    .insert({
      lot_id: lotId,
      vendeur_key: vendeurKey,
      vendeur_id: vendeurId,
      status: "ouvert",
      commentaire,
      updated_at: now,
    })
    .select("lot_id, vendeur_key, status, commentaire, marque_cloture_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: lotId, vendeurKey: rawKey } = await ctx.params;
  const vendeurKey = decodeKey(rawKey);
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action =
    typeof body === "object" && body !== null && typeof (body as { action?: unknown }).action === "string"
      ? (body as { action: string }).action
      : "cloturer";

  const supabase = await createSupabaseServerClient();
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, supplier_id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 });
  if (!lot) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const supplierId = String((lot as { supplier_id: string }).supplier_id);

  if (action === "rouvrir") {
    const out = await rouvrirVendeurAchat(supabase, { lotId, vendeurKey });
    if ("error" in out) {
      return NextResponse.json({ error: out.error }, { status: out.status });
    }
    const paid = await vendeurAchatIsPaid(supabase, { lotId, vendeurKey });
    return NextResponse.json({
      ok: true,
      reouverte: true,
      comptePaye: "paid" in paid ? paid.paid : false,
    });
  }

  const confirmZeroQtyLines =
    typeof body === "object" &&
    body !== null &&
    (body as { confirmZeroQtyLines?: unknown }).confirmZeroQtyLines === true;

  const out = await cloturerVendeurAchat(supabase, {
    lotId,
    supplierId,
    vendeurKey,
    confirmZeroQtyLines,
  });

  if ("error" in out) {
    if (out.code === "NEED_CONFIRM_ZERO_QTY") {
      return NextResponse.json(
        {
          error: out.error,
          code: out.code,
          needConfirmLines: out.needConfirmLines,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: out.error,
        ...(out.missingPuLines ? { missingPuLines: out.missingPuLines } : {}),
      },
      { status: out.status },
    );
  }

  return NextResponse.json({ ok: true, cloture: true });
}
