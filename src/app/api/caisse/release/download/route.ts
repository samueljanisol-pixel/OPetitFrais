import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  caisseReleasePublicUrl,
  streamCaisseReleaseFromFtp,
} from "@/lib/caisse/caisse-release-ftp";
import {
  CAISSE_RELEASE_DOWNLOAD_NAME,
  getLocalCaisseInstallerPath,
  resolveCaisseReleaseDownload,
  streamLocalCaisseRelease,
} from "@/lib/caisse/caisse-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
/** Installateur ~83 Mo via FTP */
export const maxDuration = 300;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

function attachmentHeaders(sizeBytes?: number): HeadersInit {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${CAISSE_RELEASE_DOWNLOAD_NAME}"`,
    "Cache-Control": "no-store",
  };
  if (sizeBytes != null && sizeBytes > 0) {
    headers["Content-Length"] = String(sizeBytes);
  }
  return headers;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Téléchargement installateur caisse Windows (token requis).
 * Prod : flux depuis FTP /POS (ou redirection URL publique optionnelle).
 *
 * GET /api/caisse/release/download?token=…
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const token =
    req.nextUrl.searchParams.get("token")?.trim() ||
    req.headers.get("x-caisse-ticket-token")?.trim() ||
    "";

  const localPath = await getLocalCaisseInstallerPath();
  if (localPath) {
    const streamed = await streamLocalCaisseRelease(localPath);
    if ("error" in streamed) {
      return NextResponse.json(
        { ok: false, error: streamed.error },
        { status: 404, headers: CORS_HEADERS },
      );
    }
    return new NextResponse(streamed.stream, {
      headers: attachmentHeaders(streamed.sizeBytes),
    });
  }

  const publicUrl = caisseReleasePublicUrl();
  if (publicUrl) {
    return NextResponse.redirect(publicUrl, { headers: CORS_HEADERS });
  }

  const ftpStreamed = await streamCaisseReleaseFromFtp();
  if (!("error" in ftpStreamed)) {
    return new NextResponse(ftpStreamed.stream, {
      headers: attachmentHeaders(ftpStreamed.sizeBytes),
    });
  }

  const result = await resolveCaisseReleaseDownload(req.nextUrl.origin, token);
  if ("error" in result) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: CORS_HEADERS },
    );
  }

  if (result.source === "supabase" || result.source === "ftp-public") {
    return NextResponse.redirect(result.downloadUrl, { headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { ok: false, error: ftpStreamed.error },
    { status: 503, headers: CORS_HEADERS },
  );
}
