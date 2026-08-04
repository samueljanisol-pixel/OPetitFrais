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
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { findBuiltCaisseInstallerPathSync } from "../src/lib/caisse/caisse-release";
import {
  caisseReleaseFtpRemotePath,
  uploadCaisseReleaseToFtp,
} from "../src/lib/caisse/caisse-release-ftp";
import { getCaisseAppVersion } from "../src/lib/caisse/caisse-app-version";

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

function versionFromInstallerPath(installerPath: string): string {
  const base = path.basename(installerPath);
  const match = base.match(/^OPetitFrais-Caisse-Setup-(\d+\.\d+\.\d+)\.exe$/i);
  if (match?.[1]) return match[1];
  return getCaisseAppVersion();
}

function resolveInstallerPath(cliPath: string | undefined): string {
  if (cliPath?.trim()) {
    const abs = path.resolve(cliPath.trim());
    if (!existsSync(abs)) {
      throw new Error(`Fichier introuvable : ${abs}`);
    }
    return abs;
  }

  const built = findBuiltCaisseInstallerPathSync();
  if (built) return built;

  throw new Error(
    "Installateur introuvable. Lancez d'abord : npm run dist:caisse",
  );
}

async function main(): Promise<void> {
  loadEnvLocal();

  const cliPath = process.argv[2];
  const installerPath = resolveInstallerPath(cliPath);
  const version = versionFromInstallerPath(installerPath);
  const fileSize = statSync(installerPath).size;
  const mb = (fileSize / (1024 * 1024)).toFixed(1);
  const remotePath = caisseReleaseFtpRemotePath(version);

  console.log(`Upload ${installerPath} (${mb} Mo) → FTP ${remotePath}`);

  const { sha256 } = await uploadCaisseReleaseToFtp(installerPath, version);

  console.log("OK — installateur publié sur le FTP.");
  console.log(`SHA-256 : ${sha256}`);
  console.log("");
  console.log("Téléchargement sécurisé (token CAISSE_TICKET_TOKEN) :");
  console.log("  https://opetitfrais.janisol.ma/api/caisse/release/download?token=TOKEN");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
