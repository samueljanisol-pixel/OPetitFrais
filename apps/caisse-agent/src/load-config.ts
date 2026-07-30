import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getRuntimeTicketPrinter } from "./runtime-config.js";

export type CaisseLocalConfig = {
  backofficeUrl: string;
  caisseToken: string;
  scalePort: string;
  ticketPrinter: string;
  magasinCode: string;
  caisseCode: string;
};

const DEFAULTS: CaisseLocalConfig = {
  backofficeUrl: "http://localhost:3000",
  caisseToken: "",
  scalePort: "",
  ticketPrinter: "",
  magasinCode: "00",
  caisseCode: "01",
};

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function configCandidates(): string[] {
  const cwd = process.cwd();
  return [
    process.env.OPF_CONFIG_PATH?.trim() ?? "",
    join(process.env.ProgramData ?? "", "OPetitFrais", "config.json"),
    join(cwd, "caisse.config.json"),
    join(cwd, "apps", "caisse", "caisse.config.json"),
    join(cwd, "..", "caisse.config.json"),
    join(cwd, "..", "apps", "caisse", "caisse.config.json"),
    join(cwd, "..", "caisse", "caisse.config.json"),
  ].filter((p) => p.length > 0);
}

function envLocalCandidates(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, ".env.local"),
    join(cwd, "..", ".env.local"),
    join(cwd, "..", "..", ".env.local"),
  ];
}

function readJsonConfig(path: string): Partial<CaisseLocalConfig> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      backofficeUrl:
        typeof raw.backofficeUrl === "string" ? raw.backofficeUrl : undefined,
      caisseToken: typeof raw.caisseToken === "string" ? raw.caisseToken : undefined,
      scalePort: typeof raw.scalePort === "string" ? raw.scalePort : undefined,
      ticketPrinter: typeof raw.ticketPrinter === "string" ? raw.ticketPrinter : undefined,
      magasinCode: typeof raw.magasinCode === "string" ? raw.magasinCode : undefined,
      caisseCode: typeof raw.caisseCode === "string" ? raw.caisseCode : undefined,
    };
  } catch {
    return null;
  }
}

function readTokenFromEnvLocal(): string {
  for (const path of envLocalCandidates()) {
    if (!existsSync(path)) continue;
    try {
      const env = parseEnvFile(readFileSync(path, "utf8"));
      const token = env.CAISSE_TICKET_TOKEN?.trim();
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function loadCaisseLocalConfig(): CaisseLocalConfig {
  let merged: CaisseLocalConfig = { ...DEFAULTS };

  for (const path of configCandidates()) {
    const partial = readJsonConfig(path);
    if (!partial) continue;
    merged = {
      backofficeUrl: partial.backofficeUrl?.trim() || merged.backofficeUrl,
      caisseToken: partial.caisseToken?.trim() || merged.caisseToken,
      scalePort: partial.scalePort?.trim() || merged.scalePort,
      ticketPrinter: partial.ticketPrinter?.trim() || merged.ticketPrinter,
      magasinCode: partial.magasinCode?.trim() || merged.magasinCode,
      caisseCode: partial.caisseCode?.trim() || merged.caisseCode,
    };
    break;
  }

  if (!merged.caisseToken) {
    merged.caisseToken = readTokenFromEnvLocal();
  }

  if (process.env.CAISSE_TICKET_TOKEN?.trim()) {
    merged.caisseToken = process.env.CAISSE_TICKET_TOKEN.trim();
  }

  merged.backofficeUrl = merged.backofficeUrl.replace(/\/$/, "");
  return merged;
}

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getWritableConfigPath(): string {
  const forced = process.env.OPF_CONFIG_PATH?.trim();
  if (forced) return forced;

  for (const path of configCandidates()) {
    if (existsSync(path)) return path;
  }
  return join(process.env.ProgramData ?? "", "OPetitFrais", "config.json");
}

export function saveCaisseLocalConfig(
  partial: Partial<Pick<CaisseLocalConfig, "scalePort" | "ticketPrinter">>,
): CaisseLocalConfig {
  const path = getWritableConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const current = readJsonFile(path);
  const merged = loadCaisseLocalConfig();

  if (partial.scalePort !== undefined) {
    current.scalePort = partial.scalePort.trim();
    merged.scalePort = partial.scalePort.trim();
  }
  if (partial.ticketPrinter !== undefined) {
    current.ticketPrinter = partial.ticketPrinter.trim();
    merged.ticketPrinter = partial.ticketPrinter.trim();
  }

  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return merged;
}

export function getConfiguredTicketPrinter(): string {
  return getRuntimeTicketPrinter() ?? loadCaisseLocalConfig().ticketPrinter;
}
