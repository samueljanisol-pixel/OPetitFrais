import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Client } from "basic-ftp";
import { app } from "electron";
import { loadRuntimeConfig } from "./load-config";
import { ventesLocalDir } from "./append-sale";
import { ventesDirCaisse, ventesDirMagasin } from "../../shared/caisse-identity";

const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const VENTES_JSON_NAME = /^(ventes_\d{4}-\d{2}(?:-\d{2})?|clotures)\.json$/;

type SyncState = {
  files: Record<string, { hash: string; uploadedAt: string }>;
};

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

function syncStatePath(): string {
  try {
    return join(app.getPath("userData"), "ventes-ftp-sync.json");
  } catch {
    return join(process.cwd(), "ventes-ftp-sync.json");
  }
}

function readSyncState(): SyncState {
  const path = syncStatePath();
  if (!existsSync(path)) return { files: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { files: {} };
    const filesRaw = (raw as { files?: unknown }).files;
    if (!filesRaw || typeof filesRaw !== "object" || Array.isArray(filesRaw)) return { files: {} };
    const files: SyncState["files"] = {};
    for (const [name, value] of Object.entries(filesRaw as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const hash = typeof row.hash === "string" ? row.hash : "";
      const uploadedAt = typeof row.uploadedAt === "string" ? row.uploadedAt : "";
      if (!hash) continue;
      files[name] = { hash, uploadedAt };
    }
    return { files };
  } catch {
    return { files: {} };
  }
}

function writeSyncState(state: SyncState): void {
  writeFileSync(syncStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listLocalVentesFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => VENTES_JSON_NAME.test(name));
}

function remoteVentesDir(magasinCode: string, caisseCode: string): string {
  return `/ventes_caisses/${ventesDirMagasin(magasinCode)}/${ventesDirCaisse(caisseCode)}`;
}

export async function syncVentesToFtp(): Promise<void> {
  if (syncing) return;
  const config = loadRuntimeConfig();
  const host = config.ftpHost.trim();
  const user = config.ftpUser.trim();
  const password = config.ftpPassword;
  if (!host || !user || !password) return;

  const localDir = ventesLocalDir(config.magasinCode, config.caisseCode);
  const names = listLocalVentesFiles(localDir);
  if (names.length === 0) return;

  const state = readSyncState();
  const dirty = names.filter((name) => {
    const hash = fileSha256(join(localDir, name));
    return state.files[name]?.hash !== hash;
  });
  if (dirty.length === 0) return;

  syncing = true;
  const ftp = new Client(30_000);
  try {
    await ftp.access({ host, user, password, secure: false });
    const remoteDir = remoteVentesDir(config.magasinCode, config.caisseCode);
    await ftp.ensureDir(remoteDir);

    for (const name of dirty) {
      const localPath = join(localDir, name);
      await ftp.uploadFrom(localPath, name);
      state.files[name] = { hash: fileSha256(localPath), uploadedAt: new Date().toISOString() };
      writeSyncState(state);
    }
  } catch {
    /* réessai au tick suivant — ne pas bloquer la caisse */
  } finally {
    ftp.close();
    syncing = false;
  }
}

export function startVentesFtpSync(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    void syncVentesToFtp();
  }, SYNC_INTERVAL_MS);
}

export function stopVentesFtpSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
