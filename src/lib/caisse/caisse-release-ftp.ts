import { Client } from "basic-ftp";
import { PassThrough } from "node:stream";
import { Readable } from "node:stream";
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

export function caisseReleaseFtpRemoteFileName(version?: string): string {
  const configured = process.env.CAISSE_RELEASE_FTP_FILE?.trim();
  if (configured) return configured;
  return caisseReleaseInstallerFileName(version ?? getCaisseAppVersion());
}

export function caisseReleaseFtpRemotePath(version?: string): string {
  const dir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";
  return `${dir}/${caisseReleaseFtpRemoteFileName(version)}`;
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
): Promise<string> {
  const remotePath = caisseReleaseFtpRemotePath(version);
  const remoteDir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";

  await withFtpClient(async (client) => {
    await client.ensureDir(remoteDir);
    await client.uploadFrom(localPath, remotePath);
  });

  return remotePath;
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
