import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
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

async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

loadEnvLocal();
const token = process.env.CAISSE_TICKET_TOKEN;
if (!token) {
  console.error("CAISSE_TICKET_TOKEN manquant");
  process.exit(1);
}

const metaRes = await fetch(`https://opetitfrais.janisol.ma/api/caisse/release?token=${token}`);
const meta = await metaRes.json();
console.log("API:", {
  version: meta.version,
  sizeBytes: meta.sizeBytes,
  sha256: meta.sha256,
  source: meta.source,
});

const version = meta.version || "unknown";
const apiDest = join(tmpdir(), `opf-api-${version}.exe`);
const dlRes = await fetch(meta.downloadUrl, {
  headers: { "x-caisse-ticket-token": token },
});
const buf = Buffer.from(await dlRes.arrayBuffer());
writeFileSync(apiDest, buf);
const apiHash = createHash("sha256").update(buf).digest("hex");
console.log("API download:", { size: buf.length, sha256: apiHash, match: apiHash === (meta.sha256 || "").toLowerCase() });

const ftpLocal = join(tmpdir(), `opf-ftp-${version}.exe`);
const client = new Client(120_000);
await client.access({
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  secure: false,
});
await client.downloadTo(ftpLocal, `/POS/OPetitFrais-Caisse-Setup-${version}.exe`);
let sidecar = null;
try {
  const shaPath = join(tmpdir(), `opf-${version}.sha256`);
  await client.downloadTo(shaPath, `/POS/OPetitFrais-Caisse-Setup-${version}.exe.sha256`);
  sidecar = readFileSync(shaPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase() ?? null;
} catch (e) {
  console.log("sidecar FTP:", e instanceof Error ? e.message : e);
}
client.close();

const ftpHash = await sha256File(ftpLocal);
console.log("FTP file:", { size: (await import("node:fs")).statSync(ftpLocal).size, sha256: ftpHash });
console.log("FTP sidecar:", sidecar);
console.log("FTP vs sidecar:", sidecar ? ftpHash === sidecar : "n/a");
console.log("API hash vs FTP:", apiHash === ftpHash);

const tempPath = join(tmpdir(), `OPetitFrais-Caisse-Setup-${version}.exe`);
if (existsSync(tempPath)) {
  const tempHash = await sha256File(tempPath);
  const { statSync } = await import("node:fs");
  console.log("TEMP caisse:", {
    size: statSync(tempPath).size,
    sha256: tempHash,
    matchApi: tempHash === (meta.sha256 || "").toLowerCase(),
    matchFtp: tempHash === ftpHash,
  });
} else {
  console.log("TEMP caisse: absent");
}
