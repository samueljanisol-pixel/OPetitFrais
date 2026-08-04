import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  buildShopBoutiqueTicketEscPos,
  type ShopBoutiquePosSaleLine,
} from "@/lib/caisse/shop-boutique-ticket";
import { parseWorkflowLines } from "@/lib/commandes-client/workflow";
import { getCommandeClientDetail } from "@/lib/commandes-client/queries";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function parsePosSaleLines(raw: unknown): ShopBoutiquePosSaleLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopBoutiquePosSaleLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const productName = typeof row.productName === "string" ? row.productName.trim() : "";
    const qty = typeof row.qty === "number" ? row.qty : Number(row.qty);
    if (!productName || !Number.isFinite(qty)) continue;
    out.push({
      productName,
      qty,
      salesUnit: typeof row.salesUnit === "string" ? row.salesUnit : null,
      comment: typeof row.comment === "string" ? row.comment : null,
    });
  }
  return out;
}

async function buildTicketResponse(input: {
  cartId: string;
  ticketRef: string;
  paymentStatusParam: string;
  encode: string | null;
  posSaleLines: ShopBoutiquePosSaleLine[];
}): Promise<NextResponse> {
  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase indisponible" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const { item, error } = await getCommandeClientDetail(supabase, input.cartId);
  if (error || !item) {
    return NextResponse.json({ error: error ?? "Commande introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const paymentStatus =
    input.paymentStatusParam === "paid" || input.paymentStatusParam === "unpaid"
      ? input.paymentStatusParam
      : item.payment_status;

  const bytes = buildShopBoutiqueTicketEscPos({
    cartNumber: item.cart_number,
    clientName: item.client_nom,
    fulfillmentMode: item.fulfillment_mode,
    paymentStatus,
    ticketRef: input.ticketRef,
    lines: parseWorkflowLines(item.lines),
    magasinNom: item.magasin_nom,
    posSaleLines: input.posSaleLines,
  });

  if (input.encode === "base64") {
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

export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const cartId = (req.nextUrl.searchParams.get("cartId") ?? "").trim();
  const ticketRef = (req.nextUrl.searchParams.get("ticketRef") ?? "").trim();
  const paymentStatusParam = (req.nextUrl.searchParams.get("paymentStatus") ?? "").trim();

  if (!cartId || !ticketRef) {
    return NextResponse.json({ error: "cartId et ticketRef requis" }, { status: 400, headers: CORS_HEADERS });
  }

  return buildTicketResponse({
    cartId,
    ticketRef,
    paymentStatusParam,
    encode: req.nextUrl.searchParams.get("encode")?.trim() ?? null,
    posSaleLines: [],
  });
}

type PostBody = {
  cartId?: string;
  ticketRef?: string;
  paymentStatus?: string;
  encode?: string;
  lines?: unknown;
};

export async function POST(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400, headers: CORS_HEADERS });
  }

  const cartId = typeof body.cartId === "string" ? body.cartId.trim() : "";
  const ticketRef = typeof body.ticketRef === "string" ? body.ticketRef.trim() : "";
  const paymentStatusParam = typeof body.paymentStatus === "string" ? body.paymentStatus.trim() : "";

  if (!cartId || !ticketRef) {
    return NextResponse.json({ error: "cartId et ticketRef requis" }, { status: 400, headers: CORS_HEADERS });
  }

  return buildTicketResponse({
    cartId,
    ticketRef,
    paymentStatusParam,
    encode: typeof body.encode === "string" ? body.encode.trim() : "base64",
    posSaleLines: parsePosSaleLines(body.lines),
  });
}
