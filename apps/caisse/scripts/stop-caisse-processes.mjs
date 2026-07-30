import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROCESS_IMAGES = [
  "electron.exe",
  "OPetitFrais Caisse.exe",
  "OPetitFrais-Caisse.exe",
];

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runQuiet(command) {
  try {
    execSync(command, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function collectProtectedPids() {
  const pids = new Set([process.pid, process.ppid].filter((n) => typeof n === "number" && n > 0));
  if (process.platform !== "win32") return [...pids];

  try {
    const raw = execSync(
      `powershell -NoProfile -Command "$p=${process.pid}; $out=@($p); for($i=0;$i -lt 12;$i++){ try { $proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p) -ErrorAction Stop; if(-not $proc.ParentProcessId -or $proc.ParentProcessId -eq 0){break}; $p=$proc.ParentProcessId; $out+=$p } catch { break } }; $out -join ','"`,
      { encoding: "utf8" },
    ).trim();
    for (const part of raw.split(",")) {
      const n = Number.parseInt(part.trim(), 10);
      if (Number.isFinite(n) && n > 0) pids.add(n);
    }
  } catch {
    /* ignore */
  }

  return [...pids];
}

function killElectronExecutables() {
  for (const image of PROCESS_IMAGES) {
    runQuiet(`taskkill /F /IM "${image}" /T`);
  }
}

/** Tue uniquement les .exe caisse/Electron (sans toucher au build npm). */
export function killElectronOnly(options = {}) {
  const { label = null } = options;
  killElectronExecutables();
  if (label) {
    console.log(`[${label}] Electron / caisse arrêtés.`);
  }
  sleep(600);
}

/** Arrêt complet avant release (preview dev, exécutables dist-win). */
export function stopCaisseProcesses(options = {}) {
  const { label = "stop-caisse" } = options;

  killElectronExecutables();

  if (process.platform !== "win32") {
    if (label) console.log(`[${label}] Caisse / preview / Electron arrêtés.`);
    sleep(1200);
    return;
  }

  const protectedPids = collectProtectedPids().join(",");
  const caisseRoot = path
    .join(path.dirname(fileURLToPath(import.meta.url)), "..")
    .replace(/\\/g, "\\\\");

  const ps = [
    `$protected = @(${protectedPids.split(",").filter(Boolean).join(",")})`,
    `$caisseRoot = '${caisseRoot}'`,
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $pid = $_.ProcessId",
    "  if ($protected -contains $pid) { return $false }",
    "  $cmd = $_.CommandLine",
    "  if (-not $cmd) { return $false }",
    "  if ($cmd -match 'predist\\.mjs|generate-caisse-icon|electron-builder-win|release-caisse|dist:caisse|npm run dist|npm-cli\\.js run dist|tsx |tsc|build:caisse-core|electron-vite build') { return $false }",
    "  if ($_.Name -eq 'electron.exe') { return $true }",
    "  if ($_.ExecutablePath -and $_.ExecutablePath -like '*\\\\dist-win\\\\*') { return $true }",
    "  if ($_.Name -eq 'node.exe' -and $cmd -match 'electron-vite (dev|preview)') { return $true }",
    "  return $false",
    "} | ForEach-Object {",
    "  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue",
    "}",
  ].join("; ");

  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      stdio: "ignore",
    });
  } catch {
    /* ignore */
  }

  if (label) {
    console.log(`[${label}] Caisse / preview / Electron arrêtés.`);
  }

  sleep(1200);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stopCaisseProcesses({ label: "stop-caisse" });
}
