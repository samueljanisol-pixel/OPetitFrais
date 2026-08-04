import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { getCaisseAppVersion } from "@/lib/caisse/caisse-app-version";
import {
  caisseReleasePublicDownloadUrl,
  caisseReleasePublicUrl,
  downloadCaisseReleaseFromFtpToFile,
} from "@/lib/caisse/caisse-release-ftp";
import { caisseReleaseDownloadName } from "@/lib/caisse/caisse-release-filename";
import {
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

function attachmentHeaders(filename: string, sizeBytes?: number): HeadersInit {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
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

  const version = getCaisseAppVersion();
  const filename = caisseReleaseDownloadName(version);

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
      headers: attachmentHeaders(filename, streamed.sizeBytes),
    });
  }

  const publicDownloadUrl = caisseReleasePublicDownloadUrl(version);
  if (publicDownloadUrl) {
    return NextResponse.redirect(publicDownloadUrl, { headers: CORS_HEADERS });
  }

  const legacyPublicUrl = caisseReleasePublicUrl();
  if (legacyPublicUrl) {
    return NextResponse.redirect(legacyPublicUrl, { headers: CORS_HEADERS });
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "opf-caisse-release-"));
  const tmpFile = join(tmpDir, filename);
  try {
    const downloaded = await downloadCaisseReleaseFromFtpToFile(tmpFile, version);
    if (!("error" in downloaded)) {
      const nodeStream = createReadStream(tmpFile);
      nodeStream.on("close", () => {
        void rm(tmpDir, { recursive: true, force: true });
      });
      nodeStream.on("error", () => {
        void rm(tmpDir, { recursive: true, force: true });
      });

      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return new NextResponse(webStream, {
        headers: attachmentHeaders(filename, downloaded.sizeBytes),
      });
    }
  } catch {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
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
    { ok: false, error: "Installateur caisse indisponible" },
    { status: 503, headers: CORS_HEADERS },
  );
}
