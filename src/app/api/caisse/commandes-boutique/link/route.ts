import { NextRequest, NextResponse } from "next/server";
import { formatTicketReference } from "@opf/caisse-core";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  appendWorkflowLog,
  paymentStatusFromPosPayments,
  releaseCaisseLock,
  transitionWorkflowStatus,
  workflowStatusAfterPosLink,
} from "@/lib/commandes-client/workflow";
import { resolveMagasinIdByCode, loadShopCartRow } from "@/lib/commandes-client/queries";
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
  magasinCode?: string;
  caisseCode?: string;
  ticketNumber?: number;
  soldAt?: string;
  total?: number;
  payments?: Array<{ mode: string; amount: number }>;
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
  const magasinCode = typeof body.magasinCode === "string" ? body.magasinCode.trim() : "";
  const caisseCode = typeof body.caisseCode === "string" ? body.caisseCode.trim() : "";
  const ticketNumber = typeof body.ticketNumber === "number" ? body.ticketNumber : 0;
  const total = typeof body.total === "number" ? body.total : 0;
  const payments = Array.isArray(body.payments) ? body.payments : [];

  if (!cartId || !magasinCode || !caisseCode || ticketNumber <= 0 || total <= 0) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400, headers: CORS_HEADERS });
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
  if (loadErr) {
    return NextResponse.json({ error: loadErr }, { status: 404, headers: CORS_HEADERS });
  }
  if (!row || row.workflow_status !== "a_passer_caisse") {
    return NextResponse.json({ error: "Commande non disponible" }, { status: 409, headers: CORS_HEADERS });
  }

  const { magasinId, error: magErr } = await resolveMagasinIdByCode(supabase, magasinCode);
  if (magErr || !magasinId) {
    return NextResponse.json({ error: magErr ?? "Magasin introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const ticketRef = formatTicketReference(magasinCode, caisseCode, ticketNumber);
  const paymentStatus = paymentStatusFromPosPayments(payments, total);
  const toStatus = workflowStatusAfterPosLink(row.fulfillment_mode);

  const { error: linkErr } = await supabase.from("shop_cart_pos_link").insert({
    shop_cart_id: cartId,
    magasin_id: magasinId,
    caisse_code: caisseCode,
    ticket_number: ticketNumber,
    ticket_ref: ticketRef,
    total,
  });

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500, headers: CORS_HEADERS });
  }

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: cartId,
    fromStatus: "a_passer_caisse",
    toStatus,
    extraPatch: { payment_status: paymentStatus },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500, headers: CORS_HEADERS });
  }

  await appendWorkflowLog(supabase, {
    shopCartId: cartId,
    fromStatus: "a_passer_caisse",
    toStatus,
    action: "pos_link",
    metadata: { magasinCode, caisseCode, ticketRef, total, paymentStatus },
  });

  await releaseCaisseLock(supabase, { shopCartId: cartId, magasinCode, caisseCode, force: true });

  return NextResponse.json(
    { ok: true, ticketRef, workflow_status: toStatus, payment_status: paymentStatus },
    { headers: CORS_HEADERS },
  );
}
