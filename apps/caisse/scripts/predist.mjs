import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const image of ["electron.exe", "OPetitFrais Caisse.exe"]) {
  try {
    execSync(`taskkill /F /IM "${image}" /T`, { stdio: "ignore" });
  } catch {
    /* process not running */
  }
}

const distDir = path.join(root, "dist-win");
try {
  rmSync(distDir, { recursive: true, force: true });
} catch {
  console.warn(`[predist] Impossible de vider ${distDir} — fermez la caisse / l'explorateur sur ce dossier.`);
}
