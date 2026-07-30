/**
 * Upload l'installateur Windows caisse vers Supabase Storage (bucket privé).
 *
 * Prérequis :
 *   npm run dist:caisse
 *   migration Supabase caisse-releases appliquée
 *   .env.local : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage :
 *   npm run upload:caisse-release
 *   npm run upload:caisse-release -- path/to/custom-setup.exe
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CAISSE_RELEASE_BUCKET,
  CAISSE_RELEASE_STORAGE_PATH,
} from "../src/lib/caisse/caisse-release";

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

  const releaseDir = path.join(process.cwd(), "apps", "caisse", "release");
  const candidates = [
    path.join(releaseDir, "OPetitFrais-Caisse-Setup.exe"),
    path.join(releaseDir, "OPetitFrais Caisse Setup 0.1.0.exe"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Installateur introuvable. Lancez d'abord : npm run dist:caisse",
  );
}

async function main(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local)");
  }

  const cliPath = process.argv[2];
  const installerPath = resolveInstallerPath(cliPath);
  const buffer = readFileSync(installerPath);
  const mb = (buffer.length / (1024 * 1024)).toFixed(1);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Upload ${installerPath} (${mb} Mo) → ${CAISSE_RELEASE_BUCKET}/${CAISSE_RELEASE_STORAGE_PATH}`);

  const { error } = await supabase.storage
    .from(CAISSE_RELEASE_BUCKET)
    .upload(CAISSE_RELEASE_STORAGE_PATH, buffer, {
      upsert: true,
      contentType: "application/octet-stream",
    });

  if (error) {
    throw new Error(error.message);
  }

  console.log("OK — installateur publié.");
  console.log("");
  console.log("Lien de téléchargement (remplacez BACKOFFICE et TOKEN) :");
  console.log(
    "  BACKOFFICE/api/caisse/release/download?token=TOKEN",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
