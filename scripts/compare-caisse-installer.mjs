import { createHash } from "node:crypto";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

function sha256(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

const version = process.argv[2]?.trim() || "0.1.10";
const fileName = `OPetitFrais-Caisse-Setup-${version}.exe`;
const tempPath = join(tmpdir(), fileName);
const ftpLocal = join(process.cwd(), `opf-ftp-${version}.exe`);

loadEnvLocal();

const client = new Client(120_000);
await client.access({
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  secure: false,
});
await client.downloadTo(ftpLocal, `/POS/${fileName}`);
client.close();

const ftpSize = statSync(ftpLocal).size;
const ftpHash = sha256(ftpLocal);

console.log(`FTP  ${fileName}: ${ftpSize} octets, sha256=${ftpHash}`);

if (existsSync(tempPath)) {
  const tempSize = statSync(tempPath).size;
  const tempHash = sha256(tempPath);
  console.log(`TEMP ${fileName}: ${tempSize} octets, sha256=${tempHash}`);
  console.log(`Taille identique: ${tempSize === ftpSize}`);
  console.log(`Hash identique: ${tempHash === ftpHash}`);
} else {
  console.log(`TEMP absent: ${tempPath}`);
}
