import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { createCaisseClient, loadCaisseClients } from "@/lib/caisse/load-caisse-clients";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Liste et création clients caisse magasin.
 *
 * GET /api/caisse/clients?token=…
 * POST /api/caisse/clients?token=…  { name, phone?, email?, notes? }
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const { payload, error } = await loadCaisseClients({ activeOnly: true });
  if (error || !payload) {
    return NextResponse.json(
      { ok: false, error: error ?? "Clients indisponibles" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, ...payload }, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  let body: { name?: string; phone?: string | null; email?: string | null; notes?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalide" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { client, error } = await createCaisseClient({
    name: body.name ?? "",
    phone: body.phone,
    email: body.email,
    notes: body.notes,
  });

  if (error || !client) {
    return NextResponse.json(
      { ok: false, error: error ?? "Création impossible" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, client }, { headers: CORS_HEADERS });
}
