import { execSync, spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist-win");
const outputMarker = path.join(root, ".dist-output");

const PROCESS_IMAGES = [
  "electron.exe",
  "OPetitFrais Caisse.exe",
  "OPetitFrais-Caisse.exe",
];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function killCaisseProcesses() {
  for (const image of PROCESS_IMAGES) {
    try {
      execSync(`taskkill /F /IM "${image}" /T`, { stdio: "ignore" });
    } catch {
      /* not running */
    }
  }

  if (process.platform !== "win32") return;

  const ps = [
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.ExecutablePath -and (",
    "    $_.ExecutablePath -like '*\\\\dist-win\\\\*' -or",
    "    $_.ExecutablePath -like '*\\\\apps\\\\caisse\\\\*'",
    "  ) -and $_.Name -match 'electron|OPetitFrais|caisse'",
    "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");

  try {
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function tryRemoveDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    return !existsSync(dir);
  } catch {
    return false;
  }
}

function robocopyEmpty(dir) {
  if (process.platform !== "win32") return false;

  const empty = path.join(root, ".predist-empty");
  try {
    execSync(`mkdir "${empty}"`, { stdio: "ignore" });
    execSync(`robocopy "${empty}" "${dir}" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS`, {
      stdio: "ignore",
    });
    rmSync(empty, { recursive: true, force: true });
    return tryRemoveDir(dir);
  } catch {
    try {
      rmSync(empty, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return false;
  }
}

function cleanDistDir() {
  if (!existsSync(distDir)) return true;

  killCaisseProcesses();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (tryRemoveDir(distDir)) return true;
    if (attempt < 5) sleep(800);
  }

  killCaisseProcesses();
  if (robocopyEmpty(distDir)) return true;

  return !existsSync(distDir);
}

function pickOutputDir() {
  if (cleanDistDir()) {
    return "dist-win";
  }

  const fallback = `dist-win-${Date.now()}`;
  console.warn("");
  console.warn(`[predist] ${distDir} est verrouillé (caisse ouverte, explorateur, antivirus).`);
  console.warn(`[predist] Build dans ${fallback}/ — fermez les apps puis supprimez dist-win à la main.`);
  console.warn("");
  return fallback;
}

const outputDir = pickOutputDir();
writeFileSync(outputMarker, `${outputDir}\n`, "utf8");
