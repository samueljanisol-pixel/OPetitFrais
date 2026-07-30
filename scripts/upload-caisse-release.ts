/**
 * Upload l'installateur Windows caisse vers le FTP Janisol (/POS).
 *
 * Prérequis :
 *   npm run dist:caisse
 *   .env.local : FTP_HOST, FTP_USER, FTP_PASSWORD
 *
 * Usage :
 *   npm run upload:caisse-release
 *   npm run upload:caisse-release -- path/to/custom-setup.exe
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  CAISSE_DIST_DIR_NAME,
  CAISSE_RELEASE_DOWNLOAD_NAME,
} from "../src/lib/caisse/caisse-release";
import {
  caisseReleaseFtpRemotePath,
  uploadCaisseReleaseToFtp,
} from "../src/lib/caisse/caisse-release-ftp";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function resolveInstallerPath(cliPath: string | undefined): string {
  if (cliPath?.trim()) {
    const abs = path.resolve(cliPath.trim());
    if (!existsSync(abs)) {
      throw new Error(`Fichier introuvable : ${abs}`);
    }
    return abs;
  }

  const caisseRoot = path.join(process.cwd(), "apps", "caisse");
  const markerPath = path.join(caisseRoot, ".dist-output");
  let distDirs = [path.join(caisseRoot, CAISSE_DIST_DIR_NAME)];

  if (existsSync(markerPath)) {
    const marked = readFileSync(markerPath, "utf8").trim();
    if (marked) {
      distDirs.unshift(path.join(caisseRoot, marked));
    }
  }

  for (const entry of readdirSync(caisseRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && /^dist-win-\d+$/.test(entry.name)) {
      distDirs.push(path.join(caisseRoot, entry.name));
    }
  }

  distDirs = [...new Set(distDirs)];

  const legacyReleaseDir = path.join(caisseRoot, "release");
  const fileNames = [
    CAISSE_RELEASE_DOWNLOAD_NAME,
    "OPetitFrais Caisse Setup 0.1.0.exe",
  ];

  for (const releaseDir of distDirs) {
    for (const fileName of fileNames) {
      const candidate = path.join(releaseDir, fileName);
      if (existsSync(candidate)) return candidate;
    }
  }

  for (const fileName of fileNames) {
    const candidate = path.join(legacyReleaseDir, fileName);
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Installateur introuvable. Lancez d'abord : npm run dist:caisse",
  );
}

async function main(): Promise<void> {
  loadEnvLocal();

  const cliPath = process.argv[2];
  const installerPath = resolveInstallerPath(cliPath);
  const fileSize = statSync(installerPath).size;
  const mb = (fileSize / (1024 * 1024)).toFixed(1);
  const remotePath = caisseReleaseFtpRemotePath();

  console.log(`Upload ${installerPath} (${mb} Mo) → FTP ${remotePath}`);

  await uploadCaisseReleaseToFtp(installerPath);

  console.log("OK — installateur publié sur le FTP.");
  console.log("");
  console.log("Téléchargement sécurisé (token CAISSE_TICKET_TOKEN) :");
  console.log("  https://opetitfrais.janisol.ma/api/caisse/release/download?token=TOKEN");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
