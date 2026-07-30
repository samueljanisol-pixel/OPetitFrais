import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { updateCaisseClient } from "@/lib/caisse/load-caisse-clients";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Modification fiche client caisse.
 *
 * PATCH /api/caisse/clients/[id]?token=…  { name?, phone?, email?, notes? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    active?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalide" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { client, error, status } = await updateCaisseClient(id, body);

  if (error || !client) {
    return NextResponse.json(
      { ok: false, error: error ?? "Mise à jour impossible" },
      { status: status ?? 400, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, client }, { headers: CORS_HEADERS });
}
