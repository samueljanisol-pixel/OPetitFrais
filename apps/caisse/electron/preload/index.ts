import { contextBridge, ipcRenderer } from "electron";
import type { CatalogProduct } from "@opf/caisse-core";

export type InitialCatalogPayload = {
  products: CatalogProduct[];
  error: string | null;
};

export type CartBroadcast = {
  lines: Array<{
    productName: string;
    categoryLabel: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    salesUnit: "kg" | "unit";
  }>;
  total: number;
  lineCount: number;
  idle: boolean;
};

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

export type PingSaurusScaleResult = {
  configured: boolean;
  ok: boolean;
};

export type SendSaurusCatalogResult =
  | {
      ok: true;
      productCount: number;
      pluPacketCount: number;
      skipped: Array<{ code: string; reason: string }>;
    }
  | {
      ok: false;
      error: string;
      skipped?: Array<{ code: string; reason: string }>;
    };

contextBridge.exposeInMainWorld("caisseApi", {
  getConfig: (): Promise<CaisseRuntimeConfig> => ipcRenderer.invoke("caisse:getConfig"),
  getInitialCatalog: (): Promise<InitialCatalogPayload | null> =>
    ipcRenderer.invoke("caisse:getInitialCatalog"),
  refreshCatalogCache: (): Promise<InitialCatalogPayload> =>
    ipcRenderer.invoke("caisse:refreshCatalogCache"),
  saveHardwareConfig: (partial: CaisseHardwareConfig): Promise<CaisseRuntimeConfig> =>
    ipcRenderer.invoke("caisse:saveHardwareConfig", partial),
  sendSaurusCatalog: (): Promise<SendSaurusCatalogResult> =>
    ipcRenderer.invoke("caisse:sendSaurusCatalog"),
  pingSaurusScale: (): Promise<PingSaurusScaleResult> =>
    ipcRenderer.invoke("caisse:pingSaurusScale"),
  listPrinters: (): Promise<string[]> => ipcRenderer.invoke("caisse:listPrinters"),
  quitApp: (): Promise<void> => ipcRenderer.invoke("caisse:quitApp"),
  broadcastCart: (payload: CartBroadcast) => {
    ipcRenderer.send("cart:update", payload);
  },
  onCartUpdate: (handler: (payload: CartBroadcast) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: CartBroadcast) => {
      handler(payload);
    };
    ipcRenderer.on("cart:update", listener);
    return () => ipcRenderer.removeListener("cart:update", listener);
  },
});
