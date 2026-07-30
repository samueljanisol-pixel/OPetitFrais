import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  caisseReleasePublicUrl,
  ftpCaisseReleaseExists,
  ftpCaisseReleaseSizeBytes,
  isFtpReleaseConfigured,
} from "./caisse-release-ftp";

export const CAISSE_RELEASE_BUCKET = "caisse-releases";

/** Dossier de sortie electron-builder (relatif à apps/caisse). */
export const CAISSE_DIST_DIR_NAME = "dist-win";

/** Objet Supabase Storage (privé) — secours si FTP indisponible. */
export const CAISSE_RELEASE_STORAGE_PATH =
  process.env.CAISSE_RELEASE_STORAGE_PATH?.trim() || "windows/latest/setup.exe";

export const CAISSE_RELEASE_DOWNLOAD_NAME =
  process.env.CAISSE_RELEASE_DOWNLOAD_NAME?.trim() || "OPetitFrais-Caisse-Setup.exe";

const SIGNED_URL_TTL_SEC = 60 * 60;

export type CaisseReleaseSource = "local" | "ftp" | "ftp-public" | "supabase";

export type CaisseReleaseInfo = {
  version: string;
  filename: string;
  source: CaisseReleaseSource;
  sizeBytes: number | null;
  downloadUrl: string;
  expiresAt: string | null;
};

function releaseVersion(): string {
  return process.env.CAISSE_RELEASE_VERSION?.trim() || "0.1.0";
}

export async function getLocalCaisseInstallerPath(): Promise<string | null> {
  const configured = process.env.CAISSE_RELEASE_INSTALLER_PATH?.trim();
  if (configured) return configured;

  const releaseDir = path.join(process.cwd(), "apps", "caisse", CAISSE_DIST_DIR_NAME);
  const legacyReleaseDir = path.join(process.cwd(), "apps", "caisse", "release");
  const candidates = [
    path.join(releaseDir, "OPetitFrais-Caisse-Setup.exe"),
    path.join(releaseDir, "OPetitFrais Caisse Setup 0.1.0.exe"),
    path.join(legacyReleaseDir, "OPetitFrais-Caisse-Setup.exe"),
    path.join(legacyReleaseDir, "OPetitFrais Caisse Setup 0.1.0.exe"),
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

function apiDownloadUrl(origin: string, token: string): string {
  const downloadPath = `/api/caisse/release/download?token=${encodeURIComponent(token)}`;
  return `${origin.replace(/\/$/, "")}${downloadPath}`;
}

export async function resolveCaisseReleaseDownload(
  origin: string,
  token: string,
): Promise<CaisseReleaseInfo | { error: string; status: number }> {
  const version = releaseVersion();
  const filename = CAISSE_RELEASE_DOWNLOAD_NAME;
  const downloadUrl = apiDownloadUrl(origin, token);

  const localPath = await getLocalCaisseInstallerPath();
  if (localPath) {
    let sizeBytes: number | null = null;
    try {
      const stat = await fs.stat(localPath);
      sizeBytes = stat.size;
    } catch {
      sizeBytes = null;
    }
    return {
      version,
      filename,
      source: "local",
      sizeBytes,
      downloadUrl,
      expiresAt: null,
    };
  }

  const publicUrl = caisseReleasePublicUrl();
  if (isFtpReleaseConfigured() || publicUrl) {
    const exists = await ftpCaisseReleaseExists();
    if (exists) {
      return {
        version,
        filename,
        source: publicUrl ? "ftp-public" : "ftp",
        sizeBytes: await ftpCaisseReleaseSizeBytes(),
        downloadUrl,
        expiresAt: null,
      };
    }
    if (isFtpReleaseConfigured()) {
      return {
        error:
          "Installateur caisse introuvable sur le FTP (/POS). Lancez `npm run upload:caisse-release` après `npm run dist:caisse`.",
        status: 404,
      };
    }
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Supabase non configuré";
    return { error: msg, status: 503 };
  }

  const folder = path.posix.dirname(CAISSE_RELEASE_STORAGE_PATH);
  const objectName = path.posix.basename(CAISSE_RELEASE_STORAGE_PATH);

  const { data: listed, error: listError } = await supabase.storage
    .from(CAISSE_RELEASE_BUCKET)
    .list(folder === "." ? "" : folder, { search: objectName, limit: 1 });

  if (listError || !listed?.some((f) => f.name === objectName)) {
    return {
      error:
        "Installateur caisse introuvable (FTP /POS ou Supabase). Lancez `npm run upload:caisse-release`.",
      status: 404,
    };
  }

  const fileMeta = listed.find((f) => f.name === objectName);
  const sizeBytes = fileMeta?.metadata?.size ?? null;

  const { data, error } = await supabase.storage
    .from(CAISSE_RELEASE_BUCKET)
    .createSignedUrl(CAISSE_RELEASE_STORAGE_PATH, SIGNED_URL_TTL_SEC, {
      download: filename,
    });

  if (error || !data?.signedUrl) {
    return {
      error: error?.message ?? "Impossible de générer le lien de téléchargement",
      status: 503,
    };
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();

  return {
    version,
    filename,
    source: "supabase",
    sizeBytes: sizeBytes,
    downloadUrl: data.signedUrl,
    expiresAt,
  };
}

export async function streamLocalCaisseRelease(
  filePath: string,
): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number } | { error: string }> {
  try {
    const stat = await fs.stat(filePath);
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return { stream: webStream, sizeBytes: stat.size };
  } catch {
    return { error: "Fichier installateur introuvable sur le serveur" };
  }
}
