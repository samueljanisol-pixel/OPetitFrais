import type { CaisseHardwareConfig, CaisseIdentityConfig, CaisseRuntimeConfig } from "../../electron/preload/index";
import {
  applyHardwareConfigOnAgent,
  fetchAgentHardwareConfig,
  fetchSerialPorts,
  fetchPrinters as fetchAgentPrinters,
  type SerialPortOption,
} from "./agent";
import { withTimeout } from "./fetch-timeout";

let cachedConfig: CaisseRuntimeConfig | null = null;

export function invalidateCaisseConfigCache(): void {
  cachedConfig = null;
}

export async function getCaisseRuntimeConfig(): Promise<CaisseRuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  if (window.caisseApi?.getConfig) {
    cachedConfig = await window.caisseApi.getConfig();
    return cachedConfig;
  }

  const agentConfig = await fetchAgentHardwareConfig();
  cachedConfig = {
    backofficeUrl: (import.meta.env.VITE_OPF_BACKOFFICE_URL ?? "http://localhost:3000").replace(
      /\/$/,
      "",
    ),
    caisseToken: import.meta.env.VITE_OPF_CAISSE_TOKEN ?? "",
    scalePort: agentConfig.scalePort,
    saurusScaleIp: "",
    ticketPrinter: agentConfig.ticketPrinter,
    magasinCode: "00",
    caisseCode: "01",
    posteId: "",
  };
  return cachedConfig;
}

export async function saveCaisseIdentityConfig(
  identity: CaisseIdentityConfig,
): Promise<CaisseRuntimeConfig> {
  if (window.caisseApi?.saveIdentityConfig) {
    cachedConfig = await window.caisseApi.saveIdentityConfig(identity);
    return cachedConfig;
  }
  throw new Error("Enregistrement identité indisponible");
}

export async function syncHardwareConfigToAgent(): Promise<void> {
  const config = await getCaisseRuntimeConfig();
  try {
    await applyHardwareConfigOnAgent({
      scalePort: config.scalePort,
      ticketPrinter: config.ticketPrinter,
    });
  } catch {
    /* agent pas encore démarré — resynchronisé au prochain enregistrement ou impression */
  }
}

export async function saveCaisseHardwareConfig(
  partial: CaisseHardwareConfig,
): Promise<CaisseRuntimeConfig> {
  if (window.caisseApi?.saveHardwareConfig) {
    cachedConfig = await window.caisseApi.saveHardwareConfig(partial);
  }

  try {
    const agentResult = await applyHardwareConfigOnAgent({
      scalePort: partial.scalePort,
      ticketPrinter: partial.ticketPrinter,
    });
    if (cachedConfig) {
      cachedConfig = {
        ...cachedConfig,
        scalePort: agentResult.scalePort,
        saurusScaleIp:
          partial.saurusScaleIp !== undefined ? partial.saurusScaleIp.trim() : cachedConfig.saurusScaleIp,
        ticketPrinter: agentResult.ticketPrinter,
      };
    }
  } catch {
    if (cachedConfig) {
      cachedConfig = {
        ...cachedConfig,
        scalePort: partial.scalePort?.trim() ?? cachedConfig.scalePort,
        saurusScaleIp:
          partial.saurusScaleIp !== undefined ? partial.saurusScaleIp.trim() : cachedConfig.saurusScaleIp,
        ticketPrinter: partial.ticketPrinter?.trim() ?? cachedConfig.ticketPrinter,
      };
    }
  }

  if (!cachedConfig) {
    throw new Error("Enregistrement config indisponible");
  }

  return cachedConfig;
}

export type { SerialPortOption };

export async function listScalePortOptions(): Promise<SerialPortOption[]> {
  const agentPorts = await fetchSerialPorts();
  if (agentPorts.length > 0) {
    return agentPorts;
  }

  if (window.caisseApi?.listSerialPorts) {
    const electronPorts = await withTimeout(window.caisseApi.listSerialPorts(), 6_000, [] as SerialPortOption[]);
    if (electronPorts.length > 0) {
      return electronPorts;
    }
  }

  return [];
}

export async function isCaisseAgentReachable(): Promise<boolean> {
  try {
    const res = await withTimeout(fetch("http://127.0.0.1:4711/health"), 2_000, null);
    return res?.ok === true;
  } catch {
    return false;
  }
}

export async function listTicketPrinterOptions(): Promise<string[]> {
  if (window.caisseApi?.listPrinters) {
    const electronPrinters = await withTimeout(window.caisseApi.listPrinters(), 6_000, [] as string[]);
    if (electronPrinters.length > 0) {
      return electronPrinters;
    }
  }
  return fetchAgentPrinters();
}
