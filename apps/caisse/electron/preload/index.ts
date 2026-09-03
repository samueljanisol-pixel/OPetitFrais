import { contextBridge, ipcRenderer } from "electron";
import type { CatalogProduct } from "@opf/caisse-core";
import type {
  CaisseCaissiersPayload,
  CaisseClotureRecord,
  CaisseSessionPublic,
  CloseSessionInput,
  OpenSessionInput,
  SessionActionResult,
  UnlockSessionInput,
} from "../../shared/caisse-session";

export type {
  CaisseCaissierPublic,
  CaisseCaissiersPayload,
  CaisseClotureRecord,
  CaisseSessionPublic,
  CaisseSessionStatus,
  CloseSessionInput,
  OpenSessionInput,
  SessionActionResult,
  UnlockSessionInput,
} from "../../shared/caisse-session";

export type CloseSessionResult =
  | { ok: true; session: CaisseSessionPublic; cloture: CaisseClotureRecord }
  | { ok: false; error: string };

export type InitialCatalogPayload = {
  products: CatalogProduct[];
  categories: Array<{
    id: string;
    label: string;
    labelAr: string | null;
    sortOrder: number;
  }>;
  error: string | null;
  source?: "network" | "cache" | "none";
  fetchedAt?: string | null;
};

export type InitialClientsPayload = {
  clients: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    balanceDue: number;
    sortOrder: number;
    isSystem: boolean;
  }>;
  error: string | null;
  source?: "network" | "cache" | "none";
  fetchedAt?: string | null;
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

export type AppendSalePayload = {
  magasinCode: string;
  caisseCode: string;
  soldAt: string;
  ticketNumber: number;
  ticketRef: string;
  total: number;
  clientId: string | null;
  clientName: string | null;
  isDelivery: boolean;
  lines: Array<{
    productId: string;
    productCode: string;
    productName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    salesUnit: "kg" | "unit";
  }>;
  payments: Array<{ mode: string; label: string; amount: number }>;
  clotureRef?: string | null;
  caissierId?: string | null;
  caissierName?: string | null;
};

export type AppendSaleResult =
  | { ok: true; dayFile: string; monthFile: string }
  | { ok: false; error: string };

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
  getInitialClients: (): Promise<InitialClientsPayload | null> =>
    ipcRenderer.invoke("caisse:getInitialClients"),
  refreshClientsCache: (): Promise<InitialClientsPayload> =>
    ipcRenderer.invoke("caisse:refreshClientsCache"),
  saveHardwareConfig: (partial: CaisseHardwareConfig): Promise<CaisseRuntimeConfig> =>
    ipcRenderer.invoke("caisse:saveHardwareConfig", partial),
  saveFtpConfig: (partial: CaisseFtpConfig): Promise<CaisseRuntimeConfig> =>
    ipcRenderer.invoke("caisse:saveFtpConfig", partial),
  appendSale: (payload: AppendSalePayload): Promise<AppendSaleResult> =>
    ipcRenderer.invoke("caisse:appendSale", payload),
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
  getSession: (): Promise<CaisseSessionPublic> => ipcRenderer.invoke("caisse:getSession"),
  getCaissiers: (): Promise<CaisseCaissiersPayload> => ipcRenderer.invoke("caisse:getCaissiers"),
  refreshCaissiersCache: (): Promise<CaisseCaissiersPayload> =>
    ipcRenderer.invoke("caisse:refreshCaissiersCache"),
  openSession: (input: OpenSessionInput): Promise<SessionActionResult> =>
    ipcRenderer.invoke("caisse:openSession", input),
  lockSession: (): Promise<SessionActionResult> => ipcRenderer.invoke("caisse:lockSession"),
  unlockSession: (input: UnlockSessionInput): Promise<SessionActionResult> =>
    ipcRenderer.invoke("caisse:unlockSession", input),
  closeSession: (input: CloseSessionInput): Promise<CloseSessionResult> =>
    ipcRenderer.invoke("caisse:closeSession", input),
});
