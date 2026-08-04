import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  applyLinePreparationStatus,
  parseWorkflowLines,
  transitionWorkflowStatus,
} from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type Body = {
  cartId?: string;
  /** start | back | finish */
  action?: string;
};

export async function POST(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400, headers: CORS_HEADERS });
  }

  const cartId = typeof body.cartId === "string" ? body.cartId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!cartId || (action !== "start" && action !== "back" && action !== "finish")) {
    return NextResponse.json(
      { error: "cartId et action (start|back|finish) requis" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase indisponible" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const { row, error: loadErr } = await loadShopCartRow(supabase, cartId);
  if (loadErr || !row) {
    return NextResponse.json(
      { error: loadErr ?? "Commande introuvable" },
      { status: loadErr === "Commande introuvable" ? 404 : 500, headers: CORS_HEADERS },
    );
  }

  if (action === "start") {
    if (row.workflow_status !== "a_preparer") {
      return NextResponse.json({ error: "Préparation non disponible" }, { status: 409, headers: CORS_HEADERS });
    }

    const resetLines = parseWorkflowLines(row.lines).map((line) =>
      applyLinePreparationStatus(line, "unchecked"),
    );
    const { error: updateErr } = await supabase
      .from("shop_cart")
      .update({ lines: resetLines, preparation_comment: null })
      .eq("id", cartId)
      .eq("workflow_status", "a_preparer");
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500, headers: CORS_HEADERS });
    }

    const result = await transitionWorkflowStatus(supabase, {
      shopCartId: cartId,
      fromStatus: "a_preparer",
      toStatus: "en_preparation",
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.conflict ? 409 : 500, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json({ ok: true, workflow_status: "en_preparation" }, { headers: CORS_HEADERS });
  }

  if (action === "back") {
    if (row.workflow_status !== "en_preparation") {
      return NextResponse.json({ error: "Remise à préparer indisponible" }, { status: 409, headers: CORS_HEADERS });
    }

    const resetLines = parseWorkflowLines(row.lines).map((line) =>
      applyLinePreparationStatus(line, "unchecked"),
    );
    const { error: updateErr } = await supabase
      .from("shop_cart")
      .update({
        lines: resetLines,
        preparation_comment: null,
        prepared_at: null,
        prepared_by: null,
      })
      .eq("id", cartId)
      .eq("workflow_status", "en_preparation");
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500, headers: CORS_HEADERS });
    }

    const result = await transitionWorkflowStatus(supabase, {
      shopCartId: cartId,
      fromStatus: "en_preparation",
      toStatus: "a_preparer",
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.conflict ? 409 : 500, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json({ ok: true, workflow_status: "a_preparer" }, { headers: CORS_HEADERS });
  }

  // finish → a_passer_caisse (checklist papier : lignes marquées préparées)
  if (row.workflow_status !== "en_preparation") {
    return NextResponse.json({ error: "Fin de préparation indisponible" }, { status: 409, headers: CORS_HEADERS });
  }

  const now = new Date().toISOString();
  const lines = parseWorkflowLines(row.lines).map((line) =>
    line.unavailable ? line : applyLinePreparationStatus(line, "available"),
  );

  const { error: patchErr } = await supabase
    .from("shop_cart")
    .update({
      lines,
      prepared_at: now,
      preparation_comment: null,
    })
    .eq("id", cartId)
    .eq("workflow_status", "en_preparation");
  if (patchErr) {
    return NextResponse.json({ error: patchErr.message }, { status: 500, headers: CORS_HEADERS });
  }

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: cartId,
    fromStatus: "en_preparation",
    toStatus: "a_passer_caisse",
  });
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.conflict ? 409 : 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, workflow_status: "a_passer_caisse" }, { headers: CORS_HEADERS });
}
