import { execFile, spawn } from "node:child_process";
import { closeSync, createWriteStream, existsSync, openSync, promises as fs, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app, type BrowserWindow } from "electron";
import { loadRuntimeConfig } from "./load-config";
import { markQuitAllowed } from "./quit-control";

const execFileAsync = promisify(execFile);

export type CaisseUpdatePhase = "idle" | "checking" | "downloading" | "ready" | "installing" | "error";

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
  sizeBytes?: number | null;
};

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MIN_INSTALLER_BYTES = 5 * 1024 * 1024;

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

function updateLogPath(): string {
  return join(app.getPath("userData"), "caisse-update.log");
}

async function logUpdate(message: string): Promise<void> {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    await fs.appendFile(updateLogPath(), line, "utf8");
  } catch {
    /* ignore */
  }
  console.log(`[update] ${message}`);
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

async function removePendingInstaller(meta: PendingMeta): Promise<void> {
  await clearPendingMeta();
  try {
    await fs.unlink(meta.filePath);
  } catch {
    /* ignore */
  }
}

function readInstallerHead(filePath: string, length: number): Buffer {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const bytesRead = readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

/** Vérifie taille attendue + en-tête PE + signature NSIS (évite exe tronqués / corrompus). */
function validateInstallerFile(
  filePath: string,
  expectedSizeBytes: number | null | undefined,
): { ok: true; sizeBytes: number } | { ok: false; reason: string } {
  if (!existsSync(filePath)) {
    return { ok: false, reason: "fichier installateur absent" };
  }

  const sizeBytes = statSync(filePath).size;
  if (sizeBytes < MIN_INSTALLER_BYTES) {
    return { ok: false, reason: `installateur trop petit (${sizeBytes} octets)` };
  }

  const expected = expectedSizeBytes ?? 0;
  if (expected > 0 && sizeBytes !== expected) {
    return {
      ok: false,
      reason: `taille incorrecte (${sizeBytes} / ${expected} octets attendus)`,
    };
  }

  const head = readInstallerHead(filePath, 2);
  if (head.length < 2 || head[0] !== 0x4d || head[1] !== 0x5a) {
    return { ok: false, reason: "fichier exe invalide (en-tête PE manquant)" };
  }

  const prefix = readInstallerHead(filePath, 1024 * 1024);
  const isNsis =
    prefix.includes(Buffer.from("Nullsoft")) || prefix.includes(Buffer.from("!nsis"));
  if (!isNsis) {
    return { ok: false, reason: "installateur NSIS invalide ou incomplet" };
  }

  return { ok: true, sizeBytes };
}

async function invalidatePendingInstaller(
  meta: PendingMeta,
  reason: string,
  expectedSizeBytes?: number | null,
): Promise<void> {
  await logUpdate(
    `installateur rejeté (${reason}) — ${meta.filePath}${
      expectedSizeBytes ? ` (attendu ${expectedSizeBytes} o)` : ""
    }`,
  );
  await removePendingInstaller(meta);
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

  const stat = statSync(dest);
  if (sizeBytes && sizeBytes > 0 && stat.size !== sizeBytes) {
    try {
      await fs.unlink(dest);
    } catch {
      /* ignore */
    }
    throw new Error(`Téléchargement incomplet (${stat.size} / ${sizeBytes} octets)`);
  }

  if (total > 0 && stat.size !== total) {
    try {
      await fs.unlink(dest);
    } catch {
      /* ignore */
    }
    throw new Error(`Téléchargement incomplet (${stat.size} / ${total} octets)`);
  }

  const validated = validateInstallerFile(dest, sizeBytes ?? (total > 0 ? total : null));
  if (!validated.ok) {
    try {
      await fs.unlink(dest);
    } catch {
      /* ignore */
    }
    throw new Error(validated.reason);
  }
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
      const expectedSize = release.sizeBytes ?? pending.sizeBytes ?? null;
      const cached = validateInstallerFile(pending.filePath, expectedSize);
      if (cached.ok) {
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
      await invalidatePendingInstaller(pending, cached.reason, expectedSize);
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
    const validated = validateInstallerFile(dest, release.sizeBytes);
    if (!validated.ok) {
      throw new Error(validated.reason);
    }
    await writePendingMeta({
      version: release.version,
      filePath: dest,
      sizeBytes: validated.sizeBytes,
    });
    await logUpdate(`téléchargé ${dest} (${validated.sizeBytes} octets)`);

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

async function unblockWindowsFile(filePath: string): Promise<void> {
  if (process.platform !== "win32") return;
  const escaped = filePath.replace(/'/g, "''");
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", `Unblock-File -LiteralPath '${escaped}'`],
      { windowsHide: true, timeout: 10_000 },
    );
  } catch {
    /* ignore */
  }
}

function spawnInstallerDirect(installerPath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(installerPath, ["/S"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    child.once("error", (err) => {
      reject(err);
    });

    child.once("spawn", () => {
      const pid = child.pid ?? null;
      child.unref();
      resolve(pid);
    });
  });
}

async function spawnInstallerViaCmd(installerPath: string): Promise<void> {
  const comSpec = process.env.ComSpec || "cmd.exe";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(comSpec, ["/d", "/s", "/c", "start", '""', "/min", installerPath, "/S"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        child.unref();
        resolve();
        return;
      }
      reject(new Error(`cmd start a échoué (code ${code ?? "?"})`));
    });
  });
}

async function spawnInstallerViaPowerShell(installerPath: string): Promise<void> {
  const escaped = installerPath.replace(/'/g, "''");
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Start-Process -LiteralPath '${escaped}' -ArgumentList '/S' -WindowStyle Hidden -PassThru | Out-Null`,
    ],
    { windowsHide: true, timeout: 15_000 },
  );
}

async function spawnInstaller(installerPath: string): Promise<number | null> {
  try {
    const pid = await spawnInstallerDirect(installerPath);
    await logUpdate(`installateur lancé (pid ${pid ?? "?"})`);
    return pid;
  } catch (directErr) {
    const directMsg = directErr instanceof Error ? directErr.message : String(directErr);
    await logUpdate(`spawn direct échoué (${directMsg})`);
  }

  try {
    await spawnInstallerViaCmd(installerPath);
    await logUpdate("installateur lancé via cmd start");
    return null;
  } catch (cmdErr) {
    const cmdMsg = cmdErr instanceof Error ? cmdErr.message : String(cmdErr);
    await logUpdate(`cmd start échoué (${cmdMsg})`);
  }

  await spawnInstallerViaPowerShell(installerPath);
  await logUpdate("installateur lancé via PowerShell");
  return null;
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

  if (!existsSync(pending.filePath)) {
    return { ok: false, error: "Fichier installateur supprimé — retéléchargez la MAJ" };
  }

  try {
    const size = statSync(pending.filePath).size;
    const release = await fetchReleaseInfo();
    const expectedSize =
      release.ok && release.sizeBytes ? release.sizeBytes : pending.sizeBytes ?? null;
    const validated = validateInstallerFile(pending.filePath, expectedSize);
    if (!validated.ok) {
      await invalidatePendingInstaller(pending, validated.reason, expectedSize);
      return { ok: false, error: `${validated.reason} — retéléchargez la MAJ` };
    }
    if (size < MIN_INSTALLER_BYTES) {
      return { ok: false, error: "Installateur incomplet — retéléchargez la MAJ" };
    }

    setState({
      phase: "installing",
      error: null,
      installerReady: true,
      progressPercent: 100,
    });
    markQuitAllowed();
    await unblockWindowsFile(pending.filePath);
    await logUpdate(`lancement ${pending.filePath} /S (${size} octets)`);
    await spawnInstaller(pending.filePath);

    setTimeout(() => {
      app.quit();
    }, 2500);

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lancement installateur impossible";
    await logUpdate(`échec lancement: ${msg}`);
    setState({ phase: "ready", error: msg, installerReady: true });
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
      let expectedSize = pending.sizeBytes ?? null;
      if (expectedSize == null) {
        const release = await fetchReleaseInfo();
        if (release.ok) {
          expectedSize = release.sizeBytes;
        }
      }
      const validated = validateInstallerFile(pending.filePath, expectedSize);
      if (validated.ok) {
        setState({
          phase: "ready",
          latestVersion: pending.version,
          updateAvailable: true,
          installerReady: true,
          progressPercent: 100,
          currentVersion: app.getVersion(),
        });
      } else {
        await invalidatePendingInstaller(pending, validated.reason, expectedSize);
      }
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
