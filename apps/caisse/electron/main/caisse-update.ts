import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  openSync,
  promises as fs,
  readSync,
  statSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import { URL } from "node:url";
import { promisify } from "node:util";
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
  sha256?: string | null;
  error?: string;
};

type PendingMeta = {
  version: string;
  filePath: string;
  sizeBytes?: number | null;
  sha256?: string | null;
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

/** Hash fichier — éviter pipeline(stream, hash) sous Electron (digest parfois faux). */
async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer | string) => {
      hash.update(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

/** Vérifie taille attendue + en-tête PE + signature NSIS (+ SHA-256 si fourni). */
async function validateInstallerFile(
  filePath: string,
  expectedSizeBytes: number | null | undefined,
  expectedSha256?: string | null,
): Promise<{ ok: true; sizeBytes: number; sha256: string } | { ok: false; reason: string }> {
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

  const sha256 = await sha256File(filePath);
  const expectedHash = expectedSha256?.trim().toLowerCase() ?? "";
  if (expectedHash && sha256 !== expectedHash) {
    await logUpdate(
      `SHA-256 mismatch: got ${sha256.slice(0, 16)}… expected ${expectedHash.slice(0, 16)}… (${sizeBytes} o)`,
    );
    return {
      ok: false,
      reason: `checksum SHA-256 incorrect (fichier corrompu)`,
    };
  }

  return { ok: true, sizeBytes, sha256 };
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
  | {
      ok: true;
      version: string;
      downloadUrl: string;
      sizeBytes: number | null;
      sha256: string | null;
    }
  | { ok: false; error: string }
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
    sha256: typeof json.sha256 === "string" && json.sha256.length > 0 ? json.sha256.toLowerCase() : null,
  };
}

function reportDownloadProgress(received: number, total: number): void {
  if (total > 0) {
    setState({
      phase: "downloading",
      progressPercent: Math.min(99, Math.round((received / total) * 100)),
    });
  } else if (received > 0) {
    setState({ phase: "downloading", progressPercent: null });
  }
}

/** Téléchargement binaire via curl.exe (hors stack fetch Electron — fiable pour ~80 Mo). */
async function downloadViaCurl(
  downloadUrl: string,
  partPath: string,
  token: string,
  expectedSize: number | null,
): Promise<void> {
  const total = expectedSize && expectedSize > 0 ? expectedSize : 0;
  const args = [
    "-L",
    "-f",
    "--retry",
    "3",
    "--retry-delay",
    "2",
    "--connect-timeout",
    "30",
    "--max-time",
    "600",
    "-o",
    partPath,
    "-H",
    `x-caisse-ticket-token: ${token}`,
    downloadUrl,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("curl.exe", args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    const poll = setInterval(() => {
      try {
        if (existsSync(partPath)) {
          reportDownloadProgress(statSync(partPath).size, total);
        }
      } catch {
        /* ignore */
      }
    }, 400);

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", (err) => {
      clearInterval(poll);
      reject(err);
    });

    child.once("close", (code) => {
      clearInterval(poll);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`curl a échoué (code ${code ?? "?"})${stderr.trim() ? `: ${stderr.trim().slice(0, 200)}` : ""}`));
    });
  });
}

/** Fallback Node http(s) — sans fetch / Readable.fromWeb Electron. */
async function downloadViaNodeHttp(
  downloadUrl: string,
  partPath: string,
  token: string,
  expectedSize: number | null,
  redirectLeft = 5,
): Promise<void> {
  const total = expectedSize && expectedSize > 0 ? expectedSize : 0;

  await new Promise<void>((resolve, reject) => {
    const url = new URL(downloadUrl);
    const lib = url.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {};
    if (token) headers["x-caisse-ticket-token"] = token;

    const req = lib.get(downloadUrl, { headers }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectLeft <= 0) {
          reject(new Error("Trop de redirections HTTP"));
          return;
        }
        const next = new URL(res.headers.location, downloadUrl).toString();
        void downloadViaNodeHttp(next, partPath, token, expectedSize, redirectLeft - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`Téléchargement impossible (HTTP ${status})`));
        return;
      }

      const contentLength = Number(res.headers["content-length"] || 0);
      const progressTotal = total > 0 ? total : contentLength;
      let received = 0;
      const file = createWriteStream(partPath);

      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        reportDownloadProgress(received, progressTotal);
      });
      res.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
      file.on("error", reject);
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(600_000, () => {
      req.destroy(new Error("Timeout téléchargement"));
    });
  });
}

async function downloadInstallerOnce(
  downloadUrl: string,
  partPath: string,
  sizeBytes: number | null,
  expectedSha256: string | null,
): Promise<{ sizeBytes: number; sha256: string }> {
  const config = loadRuntimeConfig();
  const token = config.caisseToken.trim();

  try {
    await fs.unlink(partPath);
  } catch {
    /* ignore */
  }

  let method = "curl";
  try {
    if (process.platform === "win32") {
      await downloadViaCurl(downloadUrl, partPath, token, sizeBytes);
      await logUpdate("téléchargement via curl.exe OK");
    } else {
      throw new Error("curl réservé Windows");
    }
  } catch (curlErr) {
    const curlMsg = curlErr instanceof Error ? curlErr.message : String(curlErr);
    await logUpdate(`curl indisponible/échec (${curlMsg}) — fallback Node https`);
    method = "node-http";
    try {
      await fs.unlink(partPath);
    } catch {
      /* ignore */
    }
    await downloadViaNodeHttp(downloadUrl, partPath, token, sizeBytes);
    await logUpdate("téléchargement via Node https OK");
  }

  const validated = await validateInstallerFile(partPath, sizeBytes, expectedSha256);
  if (!validated.ok) {
    try {
      await fs.unlink(partPath);
    } catch {
      /* ignore */
    }
    throw new Error(`${validated.reason} [${method}]`);
  }

  return { sizeBytes: validated.sizeBytes, sha256: validated.sha256 };
}

async function downloadInstaller(
  downloadUrl: string,
  dest: string,
  sizeBytes: number | null,
  expectedSha256: string | null,
): Promise<{ sizeBytes: number; sha256: string }> {
  const partPath = `${dest}.part`;
  const maxAttempts = 3;
  let lastError = "Téléchargement impossible";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        await logUpdate(`nouvel essai téléchargement (${attempt}/${maxAttempts})`);
        setState({ phase: "downloading", progressPercent: 0, error: null });
      }
      const validated = await downloadInstallerOnce(
        downloadUrl,
        partPath,
        sizeBytes,
        expectedSha256,
      );
      try {
        await fs.unlink(dest);
      } catch {
        /* ignore */
      }
      await fs.rename(partPath, dest);
      return validated;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      await logUpdate(`échec téléchargement essai ${attempt}/${maxAttempts}: ${lastError}`);
    }
  }

  throw new Error(lastError);
}

async function runUpdateCheck(): Promise<void> {
  if (!app.isPackaged || downloadInFlight) return;
  downloadInFlight = true;

  try {
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

    const release = await fetchReleaseInfo();
    if (!release.ok) {
      setState({ phase: "error", error: release.error, updateAvailable: false, installerReady: false });
      return;
    }

    const pending = await readPendingMeta();

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

    if (pending && pending.version === release.version) {
      const expectedSize = release.sizeBytes ?? pending.sizeBytes ?? null;
      const expectedSha = release.sha256 ?? pending.sha256 ?? null;
      const cached = await validateInstallerFile(pending.filePath, expectedSize, expectedSha);
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
    } else if (pending) {
      // Cache obsolète (ex. 0.1.12 téléchargé, serveur déjà en 0.1.13).
      await invalidatePendingInstaller(
        pending,
        `cache ${pending.version} ≠ serveur ${release.version}`,
        release.sizeBytes,
      );
      await logUpdate(
        `recherche MAJ : abandon du cache ${pending.version} au profit de ${release.version}`,
      );
    }

    setState({
      latestVersion: release.version,
      updateAvailable: true,
      installerReady: false,
      phase: "downloading",
      progressPercent: 0,
      error: null,
    });

    const dest = installerPath(release.version);
    const validated = await downloadInstaller(
      release.downloadUrl,
      dest,
      release.sizeBytes,
      release.sha256,
    );

    await writePendingMeta({
      version: release.version,
      filePath: dest,
      sizeBytes: release.sizeBytes ?? validated.sizeBytes,
      sha256: release.sha256 ?? validated.sha256,
    });
    await logUpdate(
      `téléchargé ${dest} (${validated.sizeBytes} octets, sha256=${validated.sha256.slice(0, 12)}…)`,
    );

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

/**
 * Sous Windows, les enfants d'Electron sont tués au quit (Job Object).
 * `cmd /c start ...` crée un process hors du job → le helper survit.
 */
function spawnBreakawayCmd(helperCmdPath: string): Promise<void> {
  const comSpec = process.env.ComSpec || "cmd.exe";
  // start "title" /min → premier quoted = titre ; puis la commande .cmd
  return new Promise((resolve, reject) => {
    const child = spawn(
      comSpec,
      ["/d", "/s", "/c", `start "OPFUpdate" /min "" "${helperCmdPath}"`],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        cwd: app.getPath("temp"),
      },
    );
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * 1) Ouvre le setup via explorer.exe (hors Job Electron, comme un double-clic)
 * 2) Helper .cmd breakaway : attend la fin du setup, puis relance la caisse
 */
async function spawnInstaller(installerPath: string): Promise<void> {
  const appExe = process.execPath;
  const tempDir = app.getPath("temp");
  const helperCmd = join(tempDir, "opf-caisse-run-update.cmd");
  const helperLog = join(tempDir, "opf-caisse-update-launch.log");
  const setupName = installerPath.split(/[/\\]/).pop() || "OPetitFrais-Caisse-Setup.exe";

  // ASCII only.
  const cmd = [
    "@echo off",
    "setlocal EnableExtensions",
    `echo %date% %time% helper start>>"${helperLog}"`,
    "timeout /t 3 /nobreak >nul",
    `tasklist /FI "IMAGENAME eq ${setupName}" 2>nul | find /I "${setupName}" >nul`,
    "if errorlevel 1 (",
    `  echo %date% %time% setup not running - start /wait>>"${helperLog}"`,
    `  if exist "${installerPath}" start "OPF Setup" /wait "${installerPath}"`,
    ") else (",
    `  echo %date% %time% wait until setup exits>>"${helperLog}"`,
    "  :wait_setup",
    `  tasklist /FI "IMAGENAME eq ${setupName}" 2>nul | find /I "${setupName}" >nul`,
    "  if not errorlevel 1 (",
    "    timeout /t 2 /nobreak >nul",
    "    goto wait_setup",
    "  )",
    ")",
    `echo %date% %time% setup finished>>"${helperLog}"`,
    `if exist "${installerPath}" del /f /q "${installerPath}" >nul 2>&1`,
    "timeout /t 1 /nobreak >nul",
    `echo %date% %time% relaunch app>>"${helperLog}"`,
    `start "" "${appExe}"`,
    "endlocal",
    "",
  ].join("\r\n");

  await fs.writeFile(helperCmd, cmd, "utf8");
  await logUpdate(`helper cmd écrit → ${helperCmd}`);

  // Ouvrir le setup tout de suite (survit au quit Electron).
  await new Promise<void>((resolve, reject) => {
    const child = spawn("explorer.exe", [installerPath], {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  await logUpdate(`setup ouvert via explorer.exe → ${installerPath}`);

  // Relance après install (process hors job via start).
  await spawnBreakawayCmd(helperCmd);
  await logUpdate(`helper relaunch breakaway — log ${helperLog}`);
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
    const currentVersion = app.getVersion();
    setState({
      phase: "checking",
      currentVersion,
      installerReady: true,
      error: null,
      progressPercent: 100,
    });

    // Toujours re-vérifier le serveur avant d'installer (nouvelle version sortie entre-temps).
    const release = await fetchReleaseInfo();
    if (!release.ok) {
      setState({ phase: "ready", installerReady: true, error: release.error });
      return { ok: false, error: release.error };
    }

    if (!isVersionNewer(release.version, currentVersion)) {
      await invalidatePendingInstaller(pending, "déjà à jour", release.sizeBytes);
      setState({
        phase: "idle",
        latestVersion: release.version,
        updateAvailable: false,
        installerReady: false,
        progressPercent: null,
        error: null,
      });
      return { ok: false, error: "Déjà à jour — installation annulée" };
    }

    if (isVersionNewer(release.version, pending.version)) {
      await logUpdate(
        `install annulée — serveur ${release.version} > cache ${pending.version}, retéléchargement`,
      );
      await invalidatePendingInstaller(
        pending,
        `version ${release.version} plus récente`,
        release.sizeBytes,
      );
      setState({
        phase: "idle",
        latestVersion: release.version,
        updateAvailable: true,
        installerReady: false,
        progressPercent: null,
        error: null,
      });
      void runUpdateCheck();
      return {
        ok: false,
        error: `Version ${release.version} disponible — téléchargement en cours`,
      };
    }

    if (pending.version !== release.version) {
      await invalidatePendingInstaller(
        pending,
        `cache ${pending.version} ≠ serveur ${release.version}`,
        release.sizeBytes,
      );
      setState({
        phase: "idle",
        installerReady: false,
        progressPercent: null,
        error: null,
      });
      void runUpdateCheck();
      return {
        ok: false,
        error: `Version serveur ${release.version} — téléchargement en cours`,
      };
    }

    const size = statSync(pending.filePath).size;
    const expectedSize = release.sizeBytes ?? pending.sizeBytes ?? null;
    const expectedSha = release.sha256 ?? pending.sha256 ?? null;
    const validated = await validateInstallerFile(pending.filePath, expectedSize, expectedSha);
    if (!validated.ok) {
      await invalidatePendingInstaller(pending, validated.reason, expectedSize);
      void runUpdateCheck();
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
      latestVersion: release.version,
    });
    markQuitAllowed();
    await unblockWindowsFile(pending.filePath);
    await logUpdate(`lancement installateur visible ${pending.filePath} (${size} octets)`);
    await spawnInstaller(pending.filePath);

    // Évite « MAJ prête » au prochain lancement (l'exe TEMP est effacé par le helper après install).
    await clearPendingMeta();

    // Quitter vite : le helper attend ~3 s puis lance l'installateur (fichiers libérés).
    setTimeout(() => {
      app.quit();
    }, 800);

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
    // Ne jamais proposer d'installer le cache TEMP sans re-vérifier le serveur :
    // une version plus récente a pu être publiée entre-temps.
    const pending = await readPendingMeta();
    const currentVersion = app.getVersion();
    if (pending && !isVersionNewer(pending.version, currentVersion)) {
      await clearPendingMeta();
      try {
        await fs.unlink(pending.filePath);
      } catch {
        /* ignore */
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
