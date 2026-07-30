import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { resolveCaisseReleaseDownload } from "@/lib/caisse/caisse-release";

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
 * Métadonnées installateur caisse + URL de téléchargement (token requis).
 *
 * GET /api/caisse/release?token=…
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const token =
    req.nextUrl.searchParams.get("token")?.trim() ||
    req.headers.get("x-caisse-ticket-token")?.trim() ||
    "";

  const origin = req.nextUrl.origin;
  const result = await resolveCaisseReleaseDownload(origin, token);

  if ("error" in result) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      version: result.version,
      filename: result.filename,
      source: result.source,
      sizeBytes: result.sizeBytes,
      downloadUrl: result.downloadUrl,
      expiresAt: result.expiresAt,
    },
    { headers: CORS_HEADERS },
  );
}
