import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { loadCaisseCatalog } from "@/lib/caisse/load-caisse-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Catalogue produits caisse magasin (grille + clavier code).
 *
 * GET /api/caisse/catalog?token=…
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const { payload, error } = await loadCaisseCatalog();
  if (error || !payload) {
    return NextResponse.json(
      { ok: false, error: error ?? "Catalogue indisponible" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, ...payload }, { headers: CORS_HEADERS });
}
