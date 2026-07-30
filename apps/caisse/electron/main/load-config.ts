import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { app } from "electron";

export type CaisseRuntimeConfig = {
  backofficeUrl: string;
  caisseToken: string;
  scalePort: string;
  saurusScaleIp: string;
  ticketPrinter: string;
  magasinCode: string;
  caisseCode: string;
};

export type CaisseHardwareConfig = Pick<
  CaisseRuntimeConfig,
  "scalePort" | "ticketPrinter" | "saurusScaleIp"
>;

const DEFAULTS: CaisseRuntimeConfig = {
  backofficeUrl: "http://localhost:3000",
  caisseToken: "",
  scalePort: "",
  saurusScaleIp: "",
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

function configPaths(): string[] {
  const paths: string[] = [];
  try {
    paths.push(join(app.getPath("userData"), "caisse.config.json"));
  } catch {
    /* app not ready */
  }
  const cwd = process.cwd();
  paths.push(
    join(cwd, "caisse.config.json"),
    join(cwd, "apps", "caisse", "caisse.config.json"),
    join(cwd, "..", "caisse.config.json"),
    join(cwd, "..", "apps", "caisse", "caisse.config.json"),
    join(cwd, "..", "caisse", "caisse.config.json"),
  );
  if (process.env.OPF_CONFIG_PATH?.trim()) {
    paths.unshift(process.env.OPF_CONFIG_PATH.trim());
  }
  return paths;
}

function envLocalPaths(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, ".env.local"),
    join(cwd, "..", ".env.local"),
    join(cwd, "..", "..", ".env.local"),
  ];
}

function readJsonConfig(path: string): Partial<CaisseRuntimeConfig> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      backofficeUrl:
        typeof raw.backofficeUrl === "string" ? raw.backofficeUrl : undefined,
      caisseToken: typeof raw.caisseToken === "string" ? raw.caisseToken : undefined,
      scalePort: typeof raw.scalePort === "string" ? raw.scalePort : undefined,
      saurusScaleIp: typeof raw.saurusScaleIp === "string" ? raw.saurusScaleIp : undefined,
      ticketPrinter: typeof raw.ticketPrinter === "string" ? raw.ticketPrinter : undefined,
      magasinCode: typeof raw.magasinCode === "string" ? raw.magasinCode : undefined,
      caisseCode: typeof raw.caisseCode === "string" ? raw.caisseCode : undefined,
    };
  } catch {
    return null;
  }
}

export function getWritableConfigPath(): string {
  try {
    return join(app.getPath("userData"), "caisse.config.json");
  } catch {
    return join(process.cwd(), "caisse.config.json");
  }
}

export function loadRuntimeConfig(): CaisseRuntimeConfig {
  let config: CaisseRuntimeConfig = { ...DEFAULTS };

  for (const path of configPaths()) {
    const partial = readJsonConfig(path);
    if (!partial) continue;
    config = {
      backofficeUrl: partial.backofficeUrl?.trim() || config.backofficeUrl,
      caisseToken: partial.caisseToken?.trim() || config.caisseToken,
      scalePort: partial.scalePort?.trim() || config.scalePort,
      saurusScaleIp: partial.saurusScaleIp?.trim() || config.saurusScaleIp,
      ticketPrinter: partial.ticketPrinter?.trim() || config.ticketPrinter,
      magasinCode: partial.magasinCode?.trim() || config.magasinCode,
      caisseCode: partial.caisseCode?.trim() || config.caisseCode,
    };
    break;
  }

  if (!config.caisseToken) {
    for (const path of envLocalPaths()) {
      if (!existsSync(path)) continue;
      try {
        const env = parseEnvFile(readFileSync(path, "utf8"));
        const token = env.CAISSE_TICKET_TOKEN?.trim();
        if (token) {
          config.caisseToken = token;
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  config.backofficeUrl = config.backofficeUrl.replace(/\/$/, "");
  return config;
}

export function saveHardwareConfig(partial: CaisseHardwareConfig): CaisseRuntimeConfig {
  const path = getWritableConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const current = existsSync(path)
    ? ((JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) ?? {})
    : {};

  if (partial.scalePort !== undefined) {
    current.scalePort = partial.scalePort.trim();
  }
  if (partial.saurusScaleIp !== undefined) {
    current.saurusScaleIp = partial.saurusScaleIp.trim();
  }
  if (partial.ticketPrinter !== undefined) {
    current.ticketPrinter = partial.ticketPrinter.trim();
  }

  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return loadRuntimeConfig();
}
