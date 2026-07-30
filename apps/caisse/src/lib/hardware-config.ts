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

  const agentResult = await applyHardwareConfigOnAgent({
    scalePort: partial.scalePort,
    ticketPrinter: partial.ticketPrinter,
  });
  if (!cachedConfig) {
    cachedConfig = {
      backofficeUrl: (import.meta.env.VITE_OPF_BACKOFFICE_URL ?? "http://localhost:3000").replace(
        /\/$/,
        "",
      ),
      caisseToken: import.meta.env.VITE_OPF_CAISSE_TOKEN ?? "",
      scalePort: agentResult.scalePort,
      saurusScaleIp: partial.saurusScaleIp?.trim() ?? "",
      ticketPrinter: agentResult.ticketPrinter,
      magasinCode: "00",
      caisseCode: "01",
      posteId: "",
    };
  } else {
    cachedConfig = {
      ...cachedConfig,
      scalePort: agentResult.scalePort,
      saurusScaleIp:
        partial.saurusScaleIp !== undefined ? partial.saurusScaleIp.trim() : cachedConfig.saurusScaleIp,
      ticketPrinter: agentResult.ticketPrinter,
    };
  }

  return cachedConfig;
}

export type { SerialPortOption };

export async function listScalePortOptions(): Promise<SerialPortOption[]> {
  return fetchSerialPorts();
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
