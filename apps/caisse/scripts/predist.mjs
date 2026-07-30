import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killElectronOnly, sleep } from "./stop-caisse-processes.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist-win");
const outputMarker = path.join(root, ".dist-output");

function tryRemoveDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
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

function cleanDir(dir) {
  if (!existsSync(dir)) return true;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (tryRemoveDir(dir)) return true;
    if (attempt === 3) killElectronOnly();
    if (attempt < 6) sleep(700);
  }

  killElectronOnly();
  if (robocopyEmpty(dir)) return true;

  return !existsSync(dir);
}

function cleanAllDistOutputs() {
  killElectronOnly({ label: "predist" });

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "dist-win" || /^dist-win-\d+$/.test(entry.name)) {
      cleanDir(path.join(root, entry.name));
    }
  }
}

function pickOutputDir() {
  cleanAllDistOutputs();

  if (!existsSync(distDir)) {
    return "dist-win";
  }

  const fallback = `dist-win-${Date.now()}`;
  console.warn("");
  console.warn(`[predist] ${distDir} reste verrouillé — build dans ${fallback}/`);
  console.warn("[predist] Fermez l'explorateur Windows sur dist-win puis supprimez le dossier.");
  console.warn("");
  return fallback;
}

const outputDir = pickOutputDir();
writeFileSync(outputMarker, `${outputDir}\n`, "utf8");
