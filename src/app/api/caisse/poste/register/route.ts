import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { registerCaissePoste } from "@/lib/caisse/caisse-poste-register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

type RegisterBody = {
  posteId?: unknown;
  magasinCode?: unknown;
  caisseCode?: unknown;
  hostname?: unknown;
  appVersion?: unknown;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Enregistre ou met à jour l'identité d'un poste caisse.
 * Unicité (magasin, caisse) hors magasin test 0.
 *
 * POST /api/caisse/poste/register?token=…
 */
export async function POST(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corps JSON invalide" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const posteId = typeof body.posteId === "string" ? body.posteId.trim() : "";
  const magasinCode = typeof body.magasinCode === "string" ? body.magasinCode.trim() : "";
  const caisseCode = typeof body.caisseCode === "string" ? body.caisseCode.trim() : "";
  const hostname = typeof body.hostname === "string" ? body.hostname : null;
  const appVersion = typeof body.appVersion === "string" ? body.appVersion : null;

  if (!posteId || !magasinCode || !caisseCode) {
    return NextResponse.json(
      { ok: false, error: "posteId, magasinCode et caisseCode sont requis" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const result = await registerCaissePoste({
    posteId,
    magasinCode,
    caisseCode,
    hostname,
    appVersion,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      posteId: result.posteId,
      magasinCode: result.magasinCode,
      caisseCode: result.caisseCode,
      isTestMagasin: result.isTestMagasin,
    },
    { headers: CORS_HEADERS },
  );
}
