import { Client } from "basic-ftp";
import { PassThrough } from "node:stream";
import { Readable } from "node:stream";

const DEFAULT_RELEASE_FILENAME = "OPetitFrais-Caisse-Setup.exe";

export const CAISSE_RELEASE_FTP_REMOTE_DIR =
  process.env.CAISSE_RELEASE_FTP_DIR?.trim() || "/POS";

export const CAISSE_RELEASE_FTP_REMOTE_FILE =
  process.env.CAISSE_RELEASE_FTP_FILE?.trim() || DEFAULT_RELEASE_FILENAME;

/** URL HTTPS publique optionnelle (redirection directe, sans relire le FTP). */
export function caisseReleasePublicUrl(): string | null {
  const raw = process.env.CAISSE_RELEASE_PUBLIC_URL?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function caisseReleaseFtpRemotePath(): string {
  const dir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";
  return `${dir}/${CAISSE_RELEASE_FTP_REMOTE_FILE}`;
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

export async function ftpCaisseReleaseSizeBytes(): Promise<number | null> {
  if (!isFtpReleaseConfigured()) return null;
  const remotePath = caisseReleaseFtpRemotePath();

  try {
    return await withFtpClient(async (client) => {
      try {
        return await client.size(remotePath);
      } catch {
        const dir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";
        const listed = await client.list(dir);
        const entry = listed.find((f) => f.name === CAISSE_RELEASE_FTP_REMOTE_FILE);
        return entry?.size ?? null;
      }
    });
  } catch {
    return null;
  }
}

export async function ftpCaisseReleaseExists(): Promise<boolean> {
  const size = await ftpCaisseReleaseSizeBytes();
  return typeof size === "number" && size > 0;
}

export async function uploadCaisseReleaseToFtp(localPath: string): Promise<void> {
  const remotePath = caisseReleaseFtpRemotePath();
  const remoteDir = CAISSE_RELEASE_FTP_REMOTE_DIR.replace(/\/+$/, "") || "/POS";

  await withFtpClient(async (client) => {
    await client.ensureDir(remoteDir);
    await client.uploadFrom(localPath, remotePath);
  });
}

export async function streamCaisseReleaseFromFtp(): Promise<
  { stream: ReadableStream<Uint8Array>; sizeBytes: number } | { error: string }
> {
  if (!isFtpReleaseConfigured()) {
    return { error: "FTP non configuré sur le serveur" };
  }

  const remotePath = caisseReleaseFtpRemotePath();
  const creds = getFtpReleaseCredentials();
  if (!creds) {
    return { error: "FTP non configuré sur le serveur" };
  }

  let sizeBytes = 0;
  try {
    sizeBytes = (await ftpCaisseReleaseSizeBytes()) ?? 0;
  } catch {
    sizeBytes = 0;
  }

  const client = new Client(300_000);
  const pass = new PassThrough();

  try {
    await client.access({
      host: creds.host,
      user: creds.user,
      password: creds.password,
      secure: false,
    });

    const downloadPromise = client.downloadTo(pass, remotePath);

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
    return { stream: webStream, sizeBytes };
  } catch (e) {
    client.close();
    const msg = e instanceof Error ? e.message : "Téléchargement FTP impossible";
    return { error: msg };
  }
}