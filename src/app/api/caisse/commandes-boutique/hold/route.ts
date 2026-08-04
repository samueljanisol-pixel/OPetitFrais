import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { holdCommandeAtCaisse } from "@/lib/commandes-client/workflow";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type Body = { cartId?: string; magasinCode?: string; caisseCode?: string };

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
  if (!cartId || !magasinCode || !caisseCode) {
    return NextResponse.json(
      { error: "cartId, magasinCode, caisseCode requis" },
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

  const result = await holdCommandeAtCaisse(supabase, { shopCartId: cartId, magasinCode, caisseCode });
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.conflict ? 409 : 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
