import { contextBridge, ipcRenderer } from "electron";
import type { CatalogProduct } from "@opf/caisse-core";

export type InitialCatalogPayload = {
  products: CatalogProduct[];
  categories: Array<{
    id: string;
    label: string;
    labelAr: string | null;
    sortOrder: number;
  }>;
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
  posteId: string;
};

export type CaisseHardwareConfig = Pick<
  CaisseRuntimeConfig,
  "scalePort" | "ticketPrinter" | "saurusScaleIp"
>;

export type CaisseIdentityConfig = Pick<
  CaisseRuntimeConfig,
  "backofficeUrl" | "caisseToken" | "magasinCode" | "caisseCode" | "posteId"
>;

export type CaisseIdentityStatus = {
  complete: boolean;
  missing: string[];
  configPath: string;
  configFileExists: boolean;
  draft: Partial<CaisseIdentityConfig>;
  isTestMagasin: boolean;
};

export type CaisseWindowMode = "setup" | "caisse";

export type CaisseUpdatePhase = "idle" | "checking" | "downloading" | "ready" | "installing" | "error";

export type CaisseUpdateState = {
  phase: CaisseUpdatePhase;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  progressPercent: number | null;
  error: string | null;
  installerReady: boolean;
};

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
  getIdentityStatus: (): Promise<CaisseIdentityStatus> =>
    ipcRenderer.invoke("caisse:getIdentityStatus"),
  saveIdentityConfig: (identity: CaisseIdentityConfig): Promise<CaisseRuntimeConfig> =>
    ipcRenderer.invoke("caisse:saveIdentityConfig", identity),
  notifyIdentityReady: (): Promise<void> => ipcRenderer.invoke("caisse:notifyIdentityReady"),
  setWindowMode: (mode: CaisseWindowMode): Promise<void> =>
    ipcRenderer.invoke("caisse:setWindowMode", mode),
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
  listSerialPorts: (): Promise<Array<{ path: string; manufacturer: string | null }>> =>
    ipcRenderer.invoke("caisse:listSerialPorts"),
  quitApp: (): Promise<void> => ipcRenderer.invoke("caisse:quitApp"),
  onRequestQuitConfirm: (handler: () => void) => {
    const listener = () => {
      handler();
    };
    ipcRenderer.on("caisse:request-quit-confirm", listener);
    return () => ipcRenderer.removeListener("caisse:request-quit-confirm", listener);
  },
  getUpdateState: (): Promise<CaisseUpdateState> => ipcRenderer.invoke("caisse:getUpdateState"),
  checkForUpdate: (): Promise<CaisseUpdateState> => ipcRenderer.invoke("caisse:checkForUpdate"),
  installUpdate: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke("caisse:installUpdate"),
  onUpdateState: (handler: (state: CaisseUpdateState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: CaisseUpdateState) => {
      handler(payload);
    };
    ipcRenderer.on("caisse:update-state", listener);
    return () => ipcRenderer.removeListener("caisse:update-state", listener);
  },
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
