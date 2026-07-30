import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app, type BrowserWindow } from "electron";
import { loadRuntimeConfig } from "./load-config";

export type CaisseUpdatePhase = "idle" | "checking" | "downloading" | "ready" | "error";

export type CaisseUpdateState = {
  phase: CaisseUpdatePhase;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  progressPercent: number | null;
  error: string | null;
  installerReady: boolean;
};

type ReleaseApiResponse = {
  ok?: boolean;
  version?: string;
  downloadUrl?: string;
  sizeBytes?: number | null;
  error?: string;
};

type PendingMeta = {
  version: string;
  filePath: string;
};

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function installerFileName(version: string): string {
  return `OPetitFrais-Caisse-Setup-${version.trim()}.exe`;
}

let getMainWindow: (() => BrowserWindow | null) | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let downloadInFlight = false;

let state: CaisseUpdateState = {
  phase: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  updateAvailable: false,
  progressPercent: null,
  error: null,
  installerReady: false,
};

function pendingMetaPath(): string {
  return join(app.getPath("temp"), "opf-caisse-update.json");
}

function installerPath(version: string): string {
  return join(app.getPath("temp"), installerFileName(version));
}

function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const n = Number.parseInt(part.replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const a = parseVersionParts(candidate);
  const b = parseVersionParts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function setState(patch: Partial<CaisseUpdateState>): void {
  state = { ...state, ...patch };
  broadcast();
}

function broadcast(): void {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send("caisse:update-state", state);
  } catch {
    /* fenêtre fermée */
  }
}

async function readPendingMeta(): Promise<PendingMeta | null> {
  try {
    const raw = await fs.readFile(pendingMetaPath(), "utf8");
    const parsed = JSON.parse(raw) as PendingMeta;
    if (
      typeof parsed.version === "string" &&
      typeof parsed.filePath === "string" &&
      existsSync(parsed.filePath)
    ) {
      return parsed;
    }
  } catch {
    /* pas de meta */
  }
  return null;
}

async function writePendingMeta(meta: PendingMeta): Promise<void> {
  await fs.writeFile(pendingMetaPath(), `${JSON.stringify(meta)}\n`, "utf8");
}

async function clearPendingMeta(): Promise<void> {
  try {
    await fs.unlink(pendingMetaPath());
  } catch {
    /* ignore */
  }
}

async function fetchReleaseInfo(): Promise<
  { ok: true; version: string; downloadUrl: string; sizeBytes: number | null } | { ok: false; error: string }
> {
  const config = loadRuntimeConfig();
  if (!config.backofficeUrl.trim() || !config.caisseToken.trim()) {
    return { ok: false, error: "Configuration caisse incomplète" };
  }

  const url = `${config.backofficeUrl}/api/caisse/release?token=${encodeURIComponent(config.caisseToken)}`;
  const res = await fetch(url, {
    headers: { "x-caisse-ticket-token": config.caisseToken },
  });
  const json = (await res.json()) as ReleaseApiResponse;

  if (!res.ok || !json.ok || !json.version || !json.downloadUrl) {
    return { ok: false, error: json.error ?? `HTTP ${res.status}` };
  }

  return {
    ok: true,
    version: json.version.trim(),
    downloadUrl: json.downloadUrl,
    sizeBytes: json.sizeBytes ?? null,
  };
}

async function downloadInstaller(
  downloadUrl: string,
  dest: string,
  sizeBytes: number | null,
): Promise<void> {
  const config = loadRuntimeConfig();
  const res = await fetch(downloadUrl, {
    headers: config.caisseToken.trim()
      ? { "x-caisse-ticket-token": config.caisseToken.trim() }
      : undefined,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  }

  const total =
    sizeBytes && sizeBytes > 0
      ? sizeBytes
      : Number(res.headers.get("content-length") || 0);

  let received = 0;
  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream<Uint8Array>);

  nodeStream.on("data", (chunk: Buffer | string) => {
    received += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
    if (total > 0) {
      setState({
        phase: "downloading",
        progressPercent: Math.min(99, Math.round((received / total) * 100)),
      });
    } else if (received > 0) {
      setState({ phase: "downloading", progressPercent: null });
    }
  });

  await pipeline(nodeStream, createWriteStream(dest));
}

async function runUpdateCheck(): Promise<void> {
  if (!app.isPackaged || downloadInFlight) return;

  const config = loadRuntimeConfig();
  if (!config.backofficeUrl.trim() || !config.caisseToken.trim()) {
    setState({
      phase: "idle",
      currentVersion: app.getVersion(),
      error: null,
      progressPercent: null,
    });
    return;
  }

  const currentVersion = app.getVersion();
  setState({
    phase: "checking",
    currentVersion,
    error: null,
    progressPercent: null,
  });

  try {
    const release = await fetchReleaseInfo();
    if (!release.ok) {
      setState({ phase: "error", error: release.error, updateAvailable: false, installerReady: false });
      return;
    }

    const pending = await readPendingMeta();
    if (pending && pending.version === release.version) {
      setState({
        phase: "ready",
        latestVersion: release.version,
        updateAvailable: true,
        installerReady: true,
        progressPercent: 100,
        error: null,
      });
      return;
    }

    if (!isVersionNewer(release.version, currentVersion)) {
      if (pending) {
        await clearPendingMeta();
        try {
          await fs.unlink(pending.filePath);
        } catch {
          /* ignore */
        }
      }
      setState({
        phase: "idle",
        latestVersion: release.version,
        updateAvailable: false,
        installerReady: false,
        progressPercent: null,
        error: null,
      });
      return;
    }

    setState({
      latestVersion: release.version,
      updateAvailable: true,
      installerReady: false,
      phase: "downloading",
      progressPercent: 0,
      error: null,
    });

    downloadInFlight = true;
    const dest = installerPath(release.version);
    try {
      await fs.unlink(dest);
    } catch {
      /* ignore */
    }

    await downloadInstaller(release.downloadUrl, dest, release.sizeBytes);
    await writePendingMeta({ version: release.version, filePath: dest });

    setState({
      phase: "ready",
      installerReady: true,
      progressPercent: 100,
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur mise à jour";
    setState({
      phase: "error",
      error: msg,
      installerReady: false,
      progressPercent: null,
    });
  } finally {
    downloadInFlight = false;
  }
}

export function getCaisseUpdateState(): CaisseUpdateState {
  return state;
}

export async function installCaisseUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!state.installerReady) {
    return { ok: false, error: "Aucune mise à jour téléchargée" };
  }

  const pending = await readPendingMeta();
  if (!pending) {
    return { ok: false, error: "Installateur introuvable" };
  }

  try {
    const child = spawn(pending.filePath, ["/S"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    setTimeout(() => {
      app.quit();
    }, 400);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lancement installateur impossible";
    return { ok: false, error: msg };
  }
}

export function initCaisseUpdate(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;
  state = { ...state, currentVersion: app.getVersion() };
  broadcast();
}

export function startCaisseUpdateChecks(): void {
  if (!app.isPackaged) return;

  void (async () => {
    const pending = await readPendingMeta();
    if (pending && isVersionNewer(pending.version, app.getVersion())) {
      setState({
        phase: "ready",
        latestVersion: pending.version,
        updateAvailable: true,
        installerReady: true,
        progressPercent: 100,
        currentVersion: app.getVersion(),
      });
    }
    await runUpdateCheck();
  })();

  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => {
    void runUpdateCheck();
  }, CHECK_INTERVAL_MS);
}

export function stopCaisseUpdateTimer(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

export function triggerCaisseUpdateCheck(): Promise<void> {
  return runUpdateCheck();
}
