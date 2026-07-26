import { NextRequest, NextResponse } from "next/server";

/**
 * Autorise l’accès ticket caisse via secret partagé WinDev.
 * Accepte `?token=`, `Authorization: Bearer …`, ou `x-caisse-ticket-token`.
 */
export function authorizeCaisseTicket(
  req: NextRequest,
): { ok: true } | { ok: false; response: NextResponse } {
  const expected = (process.env.CAISSE_TICKET_TOKEN ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ticket caisse désactivé : CAISSE_TICKET_TOKEN non défini." },
        { status: 503 },
      ),
    };
  }

  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  const token =
    req.nextUrl.searchParams.get("token")?.trim() ||
    req.headers.get("x-caisse-ticket-token")?.trim() ||
    bearer ||
    "";

  if (!token || token !== expected) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non autorisé (token invalide)." }, { status: 401 }),
    };
  }

  return { ok: true };
}
