import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { app } from "electron";
import {
  evaluateIdentityFromRaw,
  formatCaisseCode,
  formatMagasinCode,
  validateIdentityDraft,
  type CaisseIdentityFields,
  type CaisseIdentityStatus,
} from "../../shared/caisse-identity";

export type CaisseRuntimeConfig = {
  backofficeUrl: string;
  caisseToken: string;
  scalePort: string;
  saurusScaleIp: string;
  ticketPrinter: string;
  magasinCode: string;
  caisseCode: string;
  posteId: string;
  ftpHost: string;
  ftpUser: string;
  ftpPassword: string;
};

export type CaisseFtpConfig = Pick<CaisseRuntimeConfig, "ftpHost" | "ftpUser" | "ftpPassword">;

export type CaisseHardwareConfig = Pick<
  CaisseRuntimeConfig,
  "scalePort" | "ticketPrinter" | "saurusScaleIp"
>;

export type CaisseIdentityConfig = Pick<
  CaisseRuntimeConfig,
  "backofficeUrl" | "caisseToken" | "magasinCode" | "caisseCode" | "posteId"
>;

const HARDWARE_DEFAULTS = {
  scalePort: "",
  saurusScaleIp: "",
  ticketPrinter: "",
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

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findExistingConfigPath(): string | null {
  for (const path of configPaths()) {
    if (existsSync(path)) return path;
  }
  return null;
}

export function getWritableConfigPath(): string {
  try {
    return join(app.getPath("userData"), "caisse.config.json");
  } catch {
    return join(process.cwd(), "caisse.config.json");
  }
}

function readPartialFromRaw(raw: Record<string, unknown> | null): Partial<CaisseRuntimeConfig> {
  if (!raw) return {};
  return {
    backofficeUrl:
      typeof raw.backofficeUrl === "string" ? raw.backofficeUrl : undefined,
    caisseToken: typeof raw.caisseToken === "string" ? raw.caisseToken : undefined,
    scalePort: typeof raw.scalePort === "string" ? raw.scalePort : undefined,
    saurusScaleIp: typeof raw.saurusScaleIp === "string" ? raw.saurusScaleIp : undefined,
    ticketPrinter: typeof raw.ticketPrinter === "string" ? raw.ticketPrinter : undefined,
    magasinCode: typeof raw.magasinCode === "string" ? raw.magasinCode : undefined,
    caisseCode: typeof raw.caisseCode === "string" ? raw.caisseCode : undefined,
    posteId: typeof raw.posteId === "string" ? raw.posteId : undefined,
    ftpHost: typeof raw.ftpHost === "string" ? raw.ftpHost : undefined,
    ftpUser: typeof raw.ftpUser === "string" ? raw.ftpUser : undefined,
    ftpPassword: typeof raw.ftpPassword === "string" ? raw.ftpPassword : undefined,
  };
}

export function getIdentityConfigStatus(): CaisseIdentityStatus {
  const existingPath = findExistingConfigPath();
  const configPath = existingPath ?? getWritableConfigPath();
  const raw = existingPath ? readJsonFile(existingPath) : null;
  return evaluateIdentityFromRaw(raw, configPath, existingPath != null);
}

function readDevEnv(): Record<string, string> {
  if (app.isPackaged) return {};
  for (const path of envLocalPaths()) {
    if (!existsSync(path)) continue;
    try {
      return parseEnvFile(readFileSync(path, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return {};
}

function devTokenFallback(): string {
  return readDevEnv().CAISSE_TICKET_TOKEN?.trim() ?? "";
}

function devFtpFallback(): CaisseFtpConfig {
  const env = readDevEnv();
  return {
    ftpHost: env.FTP_HOST?.trim() ?? "",
    ftpUser: env.FTP_USER?.trim() ?? "",
    ftpPassword: env.FTP_PASSWORD ?? "",
  };
}

export function loadRuntimeConfig(): CaisseRuntimeConfig {
  const existingPath = findExistingConfigPath();
  const raw = existingPath ? readJsonFile(existingPath) : null;
  const partial = readPartialFromRaw(raw);

  let caisseToken = partial.caisseToken?.trim() ?? "";
  if (!caisseToken) {
    caisseToken = devTokenFallback();
  }

  const ftpFallback = devFtpFallback();
  const ftpHost = partial.ftpHost?.trim() || ftpFallback.ftpHost;
  const ftpUser = partial.ftpUser?.trim() || ftpFallback.ftpUser;
  const ftpPassword = partial.ftpPassword || ftpFallback.ftpPassword;

  const magasinFormatted = formatMagasinCode(partial.magasinCode?.trim() ?? "");
  const caisseFormatted = formatCaisseCode(partial.caisseCode?.trim() ?? "");

  const config: CaisseRuntimeConfig = {
    backofficeUrl: (partial.backofficeUrl?.trim() || "http://localhost:3000").replace(/\/$/, ""),
    caisseToken,
    scalePort: partial.scalePort?.trim() || HARDWARE_DEFAULTS.scalePort,
    saurusScaleIp: partial.saurusScaleIp?.trim() || HARDWARE_DEFAULTS.saurusScaleIp,
    ticketPrinter: partial.ticketPrinter?.trim() || HARDWARE_DEFAULTS.ticketPrinter,
    magasinCode: magasinFormatted ?? "00",
    caisseCode: caisseFormatted ?? "01",
    posteId: partial.posteId?.trim() ?? "",
    ftpHost,
    ftpUser,
    ftpPassword,
  };

  return config;
}

function writeConfigFile(path: string, current: Record<string, unknown>): CaisseRuntimeConfig {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return loadRuntimeConfig();
}

function readOrCreateConfigRecord(path: string): Record<string, unknown> {
  const existing = readJsonFile(path);
  return existing ?? {};
}

export function saveIdentityConfig(identity: CaisseIdentityFields): CaisseRuntimeConfig {
  const validated = validateIdentityDraft(identity);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const path = getWritableConfigPath();
  const current = readOrCreateConfigRecord(path);

  current.backofficeUrl = validated.value.backofficeUrl;
  current.caisseToken = validated.value.caisseToken;
  current.magasinCode = validated.value.magasinCode;
  current.caisseCode = validated.value.caisseCode;
  current.posteId = validated.value.posteId;

  return writeConfigFile(path, current);
}

export function saveHardwareConfig(partial: CaisseHardwareConfig): CaisseRuntimeConfig {
  const path = getWritableConfigPath();
  const current = readOrCreateConfigRecord(path);

  if (partial.scalePort !== undefined) {
    current.scalePort = partial.scalePort.trim();
  }
  if (partial.saurusScaleIp !== undefined) {
    current.saurusScaleIp = partial.saurusScaleIp.trim();
  }
  if (partial.ticketPrinter !== undefined) {
    current.ticketPrinter = partial.ticketPrinter.trim();
  }

  return writeConfigFile(path, current);
}

export function saveFtpConfig(partial: CaisseFtpConfig): CaisseRuntimeConfig {
  const path = getWritableConfigPath();
  const current = readOrCreateConfigRecord(path);

  current.ftpHost = partial.ftpHost.trim();
  current.ftpUser = partial.ftpUser.trim();
  current.ftpPassword = partial.ftpPassword;

  return writeConfigFile(path, current);
}
