import { NextRequest, NextResponse } from "next/server";
import { formatTicketReference } from "@opf/caisse-core";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  appendWorkflowLog,
  CAISSE_ENCAISSEMENT_STATUSES,
  paymentStatusFromPosPayments,
  transitionWorkflowStatus,
  workflowStatusAfterPosCollectPayment,
  type WorkflowStatus,
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
  if (!row) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const fromStatus = row.workflow_status as WorkflowStatus;
  if (!CAISSE_ENCAISSEMENT_STATUSES.includes(fromStatus)) {
    return NextResponse.json({ error: "Encaissement non disponible pour cette commande" }, { status: 409, headers: CORS_HEADERS });
  }

  const toStatus = workflowStatusAfterPosCollectPayment(fromStatus);
  if (!toStatus) {
    return NextResponse.json({ error: "Transition impossible" }, { status: 409, headers: CORS_HEADERS });
  }

  const ticketRef = formatTicketReference(magasinCode, caisseCode, ticketNumber);
  const paymentStatus = paymentStatusFromPosPayments(payments, total);
  if (paymentStatus !== "paid") {
    return NextResponse.json(
      { error: "Le paiement doit couvrir le montant dû (pas de crédit client pour cet encaissement)" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: cartId,
    fromStatus,
    toStatus,
    extraPatch: { payment_status: "paid" },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500, headers: CORS_HEADERS });
  }

  await appendWorkflowLog(supabase, {
    shopCartId: cartId,
    fromStatus,
    toStatus,
    action: "pos_collect_payment",
    metadata: { magasinCode, caisseCode, ticketRef, total, payments },
  });

  return NextResponse.json(
    { ok: true, ticketRef, workflow_status: toStatus, payment_status: "paid" },
    { headers: CORS_HEADERS },
  );
}
