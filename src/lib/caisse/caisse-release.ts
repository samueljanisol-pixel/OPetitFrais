import { createReadStream, existsSync, readFileSync, readdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCaisseAppVersion } from "./caisse-app-version";
import {
  caisseReleasePublicDownloadUrl,
  caisseReleasePublicUrl,
  ftpCaisseReleaseSizeBytes,
  isFtpReleaseConfigured,
} from "./caisse-release-ftp";
import {
  caisseReleaseDownloadName,
  caisseReleaseInstallerCandidates,
  caisseReleaseInstallerFileName,
  LEGACY_CAISSE_RELEASE_INSTALLER,
} from "./caisse-release-filename";

export const CAISSE_RELEASE_BUCKET = "caisse-releases";

/** Dossier de sortie electron-builder (relatif à apps/caisse). */
export const CAISSE_DIST_DIR_NAME = "dist-win";

/** Objet Supabase Storage (privé) — secours si FTP indisponible. */
export const CAISSE_RELEASE_STORAGE_PATH =
  process.env.CAISSE_RELEASE_STORAGE_PATH?.trim() || "windows/latest/setup.exe";

export { caisseReleaseDownloadName, caisseReleaseInstallerFileName, LEGACY_CAISSE_RELEASE_INSTALLER };

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
  return getCaisseAppVersion();
}

function listCaisseDistDirs(caisseRoot: string): string[] {
  const markerPath = path.join(caisseRoot, ".dist-output");
  const dirs: string[] = [];

  if (existsSync(markerPath)) {
    const marked = readFileSync(markerPath, "utf8").trim();
    if (marked) dirs.push(path.join(caisseRoot, marked));
  }

  dirs.push(path.join(caisseRoot, CAISSE_DIST_DIR_NAME));

  try {
    for (const entry of readdirSync(caisseRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && /^dist-win-\d+$/.test(entry.name)) {
        dirs.push(path.join(caisseRoot, entry.name));
      }
    }
  } catch {
    /* ignore */
  }

  return [...new Set(dirs)];
}

function findVersionedInstallerInDir(dir: string): string | null {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (/^OPetitFrais-Caisse-Setup-\d+\.\d+\.\d+\.exe$/i.test(entry.name)) {
        return path.join(dir, entry.name);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function findBuiltCaisseInstallerPathSync(preferredVersion?: string): string | null {
  const caisseRoot = path.join(process.cwd(), "apps", "caisse");
  const legacyReleaseDir = path.join(caisseRoot, "release");
  const names = caisseReleaseInstallerCandidates(preferredVersion);

  for (const releaseDir of listCaisseDistDirs(caisseRoot)) {
    const versioned = findVersionedInstallerInDir(releaseDir);
    if (versioned) return versioned;

    for (const fileName of names) {
      const candidate = path.join(releaseDir, fileName);
      if (existsSync(candidate)) return candidate;
    }
  }

  for (const fileName of names) {
    const candidate = path.join(legacyReleaseDir, fileName);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export async function getLocalCaisseInstallerPath(): Promise<string | null> {
  const configured = process.env.CAISSE_RELEASE_INSTALLER_PATH?.trim();
  if (configured) return configured;

  const sync = findBuiltCaisseInstallerPathSync();
  if (sync) return sync;

  const releaseDir = path.join(process.cwd(), "apps", "caisse", CAISSE_DIST_DIR_NAME);
  const legacyReleaseDir = path.join(process.cwd(), "apps", "caisse", "release");
  const candidates = caisseReleaseInstallerCandidates();
  for (const candidate of [
    ...candidates.map((name) => path.join(releaseDir, name)),
    ...candidates.map((name) => path.join(legacyReleaseDir, name)),
  ]) {
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
  const filename = caisseReleaseDownloadName(version);
  const downloadUrl = apiDownloadUrl(origin, token);
  const publicDownloadUrl = caisseReleasePublicDownloadUrl(version);
  const publicUrl = caisseReleasePublicUrl();

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
      downloadUrl: publicDownloadUrl ?? downloadUrl,
      expiresAt: null,
    };
  }

  if (isFtpReleaseConfigured() || publicUrl || publicDownloadUrl) {
    const sizeBytes = await ftpCaisseReleaseSizeBytes(version);
    const exists = typeof sizeBytes === "number" && sizeBytes > 0;
    if (exists) {
      return {
        version,
        filename,
        source: publicDownloadUrl ? "ftp-public" : publicUrl ? "ftp-public" : "ftp",
        sizeBytes,
        downloadUrl: publicDownloadUrl ?? downloadUrl,
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
