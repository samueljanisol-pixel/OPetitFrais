import { createHash } from "node:crypto";
import { Client } from "basic-ftp";
import { createReadStream, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getCaisseAppVersion } from "./caisse-app-version";
import {
  caisseReleaseInstallerCandidates,
  caisseReleaseInstallerFileName,
  LEGACY_CAISSE_RELEASE_INSTALLER,
} from "./caisse-release-filename";

export const CAISSE_RELEASE_FTP_REMOTE_DIR =
  process.env.CAISSE_RELEASE_FTP_DIR?.trim() || "/POS";

/** URL HTTPS publique optionnelle (redirection directe, sans relire le FTP). */
export function caisseReleasePublicUrl(): string | null {
  const raw = process.env.CAISSE_RELEASE_PUBLIC_URL?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Base HTTPS publique du dossier /POS (ex. https://opetitfrais.janisol.ma/POS).
 * Permet à la caisse de télécharger l'installateur sans passer par le proxy Vercel.
 */
export function caisseReleasePublicBaseUrl(): string | null {
  const raw = process.env.CAISSE_RELEASE_PUBLIC_BASE_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/+$/, "") : null;
}

/** URL HTTPS directe de l'installateur versionné (évite proxy API + flux FTP tronqué). */
export function caisseReleasePublicDownloadUrl(version?: string): string | null {
  const base = caisseReleasePublicBaseUrl();
  if (base) {
    return `${base}/${caisseReleaseInstallerFileName(version ?? getCaisseAppVersion())}`;
  }
  return caisseReleasePublicUrl();
}

export function caisseReleaseFtpRemoteFileName(version?: string): string {
  const configured = process.env.CAISSE_RELEASE_FTP_FILE?.trim();
  if (configured) return configured;
  return caisseReleaseInstallerFileName(version ?? getCaisseAppVersion());
}

export function caisseReleaseFtpRemotePath(version?: string): string {
  const dir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";
  return `${dir}/${caisseReleaseFtpRemoteFileName(version)}`;
}

export function caisseReleaseFtpSha256RemotePath(version?: string): string {
  return `${caisseReleaseFtpRemotePath(version)}.sha256`;
}

async function sha256LocalFile(localPath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(localPath), hash);
  return hash.digest("hex");
}

function ftpRemoteCandidates(version?: string): string[] {
  return caisseReleaseInstallerCandidates(version);
}

type FtpCredentials = {
  host: string;
  user: string;
  password: string;
};

export function getFtpReleaseCredentials(): FtpCredentials | null {
  const host = process.env.FTP_HOST?.trim();
  const user = process.env.FTP_USER?.trim();
  const password = process.env.FTP_PASSWORD;
  if (!host || !user || !password) return null;
  return { host, user, password };
}

export function isFtpReleaseConfigured(): boolean {
  return getFtpReleaseCredentials() != null;
}

async function withFtpClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const creds = getFtpReleaseCredentials();
  if (!creds) {
    throw new Error("FTP non configuré (FTP_HOST / FTP_USER / FTP_PASSWORD)");
  }

  const client = new Client(120_000);
  try {
    await client.access({
      host: creds.host,
      user: creds.user,
      password: creds.password,
      secure: false,
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

type FtpReleaseMatch = {
  remotePath: string;
  sizeBytes: number | null;
};

async function resolveFtpReleaseMatch(version?: string): Promise<FtpReleaseMatch | null> {
  if (!isFtpReleaseConfigured()) return null;

  const remoteDir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";
  const candidates = ftpRemoteCandidates(version);

  return withFtpClient(async (client) => {
    for (const fileName of candidates) {
      const remotePath = `${remoteDir}/${fileName}`;
      try {
        const size = await client.size(remotePath);
        if (typeof size === "number" && size > 0) {
          return { remotePath, sizeBytes: size };
        }
      } catch {
        /* try next */
      }
    }

    try {
      const listed = await client.list(remoteDir);
      const versioned = listed.find((f) =>
        /^OPetitFrais-Caisse-Setup-\d+\.\d+\.\d+\.exe$/i.test(f.name),
      );
      if (versioned && versioned.size > 0) {
        return {
          remotePath: `${remoteDir}/${versioned.name}`,
          sizeBytes: versioned.size,
        };
      }
    } catch {
      /* ignore */
    }

    return null;
  });
}

export async function ftpCaisseReleaseSizeBytes(version?: string): Promise<number | null> {
  try {
    const match = await resolveFtpReleaseMatch(version);
    return match?.sizeBytes ?? null;
  } catch {
    return null;
  }
}

export async function ftpCaisseReleaseExists(version?: string): Promise<boolean> {
  const size = await ftpCaisseReleaseSizeBytes(version);
  return typeof size === "number" && size > 0;
}

export async function uploadCaisseReleaseToFtp(
  localPath: string,
  version?: string,
): Promise<{ remotePath: string; sha256: string }> {
  const remotePath = caisseReleaseFtpRemotePath(version);
  const remoteShaPath = caisseReleaseFtpSha256RemotePath(version);
  const remoteDir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";
  const sha256 = await sha256LocalFile(localPath);
  const shaLocal = join(tmpdir(), `opf-caisse-${sha256.slice(0, 12)}.sha256`);
  writeFileSync(shaLocal, `${sha256}\n`, "utf8");

  try {
    await withFtpClient(async (client) => {
      await client.ensureDir(remoteDir);
      await client.uploadFrom(localPath, remotePath);
      await client.uploadFrom(shaLocal, remoteShaPath);
    });
  } finally {
    try {
      unlinkSync(shaLocal);
    } catch {
      /* ignore */
    }
  }

  return { remotePath, sha256 };
}

/** Lit le sidecar `.sha256` publié avec l'installateur (null si absent). */
export async function ftpCaisseReleaseSha256(version?: string): Promise<string | null> {
  if (!isFtpReleaseConfigured()) return null;

  const remoteShaPath = caisseReleaseFtpSha256RemotePath(version);
  const localTmp = join(tmpdir(), `opf-caisse-sha-${Date.now()}.sha256`);

  try {
    await withFtpClient(async (client) => {
      await client.downloadTo(localTmp, remoteShaPath);
    });
    const raw = readFileSync(localTmp, "utf8").trim().split(/\s+/)[0] ?? "";
    if (/^[a-f0-9]{64}$/i.test(raw)) return raw.toLowerCase();
    return null;
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(localTmp);
    } catch {
      /* ignore */
    }
  }
}

export async function downloadCaisseReleaseFromFtpToFile(
  destPath: string,
  version?: string,
): Promise<{ sizeBytes: number; remotePath: string } | { error: string }> {
  if (!isFtpReleaseConfigured()) {
    return { error: "FTP non configuré sur le serveur" };
  }

  const match = await resolveFtpReleaseMatch(version);
  if (!match) {
    return { error: "Installateur caisse introuvable sur le FTP" };
  }

  try {
    await withFtpClient(async (client) => {
      await client.downloadTo(destPath, match.remotePath);
    });

    const sizeBytes = statSync(destPath).size;
    const expected = match.sizeBytes ?? 0;
    if (expected > 0 && sizeBytes !== expected) {
      return {
        error: `FTP incomplet (${sizeBytes} / ${expected} octets)`,
      };
    }
    if (sizeBytes <= 0) {
      return { error: "Fichier FTP vide" };
    }

    return { sizeBytes, remotePath: match.remotePath };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Téléchargement FTP impossible";
    return { error: msg };
  }
}

export async function streamCaisseReleaseFromFtp(
  version?: string,
): Promise<
  { stream: ReadableStream<Uint8Array>; sizeBytes: number; remotePath: string } | { error: string }
> {
  if (!isFtpReleaseConfigured()) {
    return { error: "FTP non configuré sur le serveur" };
  }

  const match = await resolveFtpReleaseMatch(version);
  if (!match) {
    return { error: "Installateur caisse introuvable sur le FTP" };
  }

  const creds = getFtpReleaseCredentials();
  if (!creds) {
    return { error: "FTP non configuré sur le serveur" };
  }

  const sizeBytes = match.sizeBytes ?? 0;
  const client = new Client(300_000);
  const pass = new PassThrough();

  try {
    await client.access({
      host: creds.host,
      user: creds.user,
      password: creds.password,
      secure: false,
    });

    const downloadPromise = client.downloadTo(pass, match.remotePath);

    pass.on("error", () => {
      client.close();
    });

    void downloadPromise
      .then(() => {
        pass.end();
      })
      .catch((err: unknown) => {
        pass.destroy(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        client.close();
      });

    const webStream = Readable.toWeb(pass) as ReadableStream<Uint8Array>;
    return { stream: webStream, sizeBytes, remotePath: match.remotePath };
  } catch (e) {
    client.close();
    const msg = e instanceof Error ? e.message : "Téléchargement FTP impossible";
    return { error: msg };
  }
}

export { LEGACY_CAISSE_RELEASE_INSTALLER };
