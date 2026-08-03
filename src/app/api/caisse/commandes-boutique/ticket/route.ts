import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { buildShopBoutiqueTicketEscPos } from "@/lib/caisse/shop-boutique-ticket";
import { parseWorkflowLines } from "@/lib/commandes-client/workflow";
import { getCommandeClientDetail } from "@/lib/commandes-client/queries";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const cartId = (req.nextUrl.searchParams.get("cartId") ?? "").trim();
  const ticketRef = (req.nextUrl.searchParams.get("ticketRef") ?? "").trim();
  const paymentStatusParam = (req.nextUrl.searchParams.get("paymentStatus") ?? "").trim();

  if (!cartId || !ticketRef) {
    return NextResponse.json({ error: "cartId et ticketRef requis" }, { status: 400, headers: CORS_HEADERS });
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

  const { item, error } = await getCommandeClientDetail(supabase, cartId);
  if (error || !item) {
    return NextResponse.json({ error: error ?? "Commande introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const paymentStatus =
    paymentStatusParam === "paid" || paymentStatusParam === "unpaid"
      ? paymentStatusParam
      : item.payment_status;

  const bytes = buildShopBoutiqueTicketEscPos({
    cartNumber: item.cart_number,
    clientName: item.client_nom,
    fulfillmentMode: item.fulfillment_mode,
    paymentStatus,
    ticketRef,
    lines: parseWorkflowLines(item.lines),
    magasinNom: item.magasin_nom,
  });

  const encode = req.nextUrl.searchParams.get("encode")?.trim();
  if (encode === "base64") {
    const base64 = Buffer.from(bytes).toString("base64");
    return NextResponse.json({ ok: true, base64 }, { headers: CORS_HEADERS });
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/octet-stream",
    },
  });
}
