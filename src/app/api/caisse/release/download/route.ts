import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  CAISSE_RELEASE_DOWNLOAD_NAME,
  resolveCaisseReleaseDownload,
  streamLocalCaisseRelease,
} from "@/lib/caisse/caisse-release";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

async function findLocalInstallerPath(): Promise<string | null> {
  const configured = process.env.CAISSE_RELEASE_INSTALLER_PATH?.trim();
  if (configured) return configured;

  const candidates = [
    path.join(process.cwd(), "apps", "caisse", "release", "OPetitFrais-Caisse-Setup.exe"),
    path.join(process.cwd(), "apps", "caisse", "release", "OPetitFrais Caisse Setup 0.1.0.exe"),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Téléchargement installateur caisse Windows (token requis).
 * Redirige vers Supabase (URL signée) ou sert le fichier local.
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

  const localPath = await findLocalInstallerPath();
  if (localPath) {
    const streamed = await streamLocalCaisseRelease(localPath);
    if ("error" in streamed) {
      return NextResponse.json(
        { ok: false, error: streamed.error },
        { status: 404, headers: CORS_HEADERS },
      );
    }
    return new NextResponse(streamed.stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${CAISSE_RELEASE_DOWNLOAD_NAME}"`,
        "Content-Length": String(streamed.sizeBytes),
        "Cache-Control": "no-store",
      },
    });
  }

  const result = await resolveCaisseReleaseDownload(req.nextUrl.origin, token);
  if ("error" in result) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: CORS_HEADERS },
    );
  }

  if (result.source !== "supabase") {
    return NextResponse.json(
      { ok: false, error: "Source de release inattendue" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.redirect(result.downloadUrl, { headers: CORS_HEADERS });
}
