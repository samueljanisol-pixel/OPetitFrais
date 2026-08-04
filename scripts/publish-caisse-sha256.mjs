import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Client } from "basic-ftp";

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
    if (!process.env[key]) process.env[key] = value;
  }
}

const version = process.argv[2]?.trim() || "0.1.10";
const fileName = `OPetitFrais-Caisse-Setup-${version}.exe`;
const candidates = [
  join(process.cwd(), `opf-ftp-${version}.exe`),
  join(process.cwd(), "apps", "caisse", "dist-win", fileName),
];

loadEnvLocal();

const local = candidates.find((p) => existsSync(p));
if (!local) {
  console.error(`Fichier introuvable pour ${version}`);
  process.exit(1);
}

const hash = createHash("sha256");
await pipeline(createReadStream(local), hash);
const sha = hash.digest("hex");
const shaLocal = join(tmpdir(), `opf-${version}.sha256`);
writeFileSync(shaLocal, `${sha}\n`, "utf8");

const client = new Client(120_000);
await client.access({
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  secure: false,
});
await client.uploadFrom(shaLocal, `/POS/${fileName}.sha256`);
client.close();
unlinkSync(shaLocal);

console.log(`OK — /POS/${fileName}.sha256`);
console.log(sha);
