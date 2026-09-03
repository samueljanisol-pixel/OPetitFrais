/// <reference types="vite/client" />

import type {
  CartBroadcast,
  AppendSalePayload,
  AppendSaleResult,
  CaisseCaissiersPayload,
  CaisseFtpConfig,
  CaisseHardwareConfig,
  CaisseIdentityConfig,
  CaisseIdentityStatus,
  CaisseRuntimeConfig,
  CaisseSessionPublic,
  CaisseUpdateState,
  CaisseWindowMode,
  CloseSessionInput,
  CloseSessionResult,
  InitialCatalogPayload,
  InitialClientsPayload,
  OpenSessionInput,
  PingSaurusScaleResult,
  SendSaurusCatalogResult,
  SessionActionResult,
  UnlockSessionInput,
} from "../electron/preload/index";

interface ImportMetaEnv {
  readonly VITE_OPF_BACKOFFICE_URL?: string;
  readonly VITE_OPF_CAISSE_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  // Polyfill Electron renderer (tickets ESC/POS)
  // eslint-disable-next-line no-var
  var Buffer: typeof import("buffer").Buffer;

  interface Window {
    caisseApi?: {
      getConfig: () => Promise<CaisseRuntimeConfig>;
      getIdentityStatus: () => Promise<CaisseIdentityStatus>;
      saveIdentityConfig: (identity: CaisseIdentityConfig) => Promise<CaisseRuntimeConfig>;
      notifyIdentityReady: () => Promise<void>;
      setWindowMode: (mode: CaisseWindowMode) => Promise<void>;
      getInitialCatalog: () => Promise<InitialCatalogPayload | null>;
      refreshCatalogCache: () => Promise<InitialCatalogPayload>;
      getInitialClients: () => Promise<InitialClientsPayload | null>;
      refreshClientsCache: () => Promise<InitialClientsPayload>;
      saveHardwareConfig: (partial: CaisseHardwareConfig) => Promise<CaisseRuntimeConfig>;
      saveFtpConfig: (partial: CaisseFtpConfig) => Promise<CaisseRuntimeConfig>;
      appendSale: (payload: AppendSalePayload) => Promise<AppendSaleResult>;
      sendSaurusCatalog: () => Promise<SendSaurusCatalogResult>;
      pingSaurusScale: () => Promise<PingSaurusScaleResult>;
      listPrinters: () => Promise<string[]>;
      listSerialPorts: () => Promise<Array<{ path: string; manufacturer: string | null }>>;
      quitApp: () => Promise<void>;
      onRequestQuitConfirm: (handler: () => void) => () => void;
      getUpdateState: () => Promise<CaisseUpdateState>;
      checkForUpdate: () => Promise<CaisseUpdateState>;
      installUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>;
      onUpdateState: (handler: (state: CaisseUpdateState) => void) => () => void;
      broadcastCart: (payload: CartBroadcast) => void;
      onCartUpdate: (handler: (payload: CartBroadcast) => void) => () => void;
      getSession: () => Promise<CaisseSessionPublic>;
      getCaissiers: () => Promise<CaisseCaissiersPayload>;
      refreshCaissiersCache: () => Promise<CaisseCaissiersPayload>;
      openSession: (input: OpenSessionInput) => Promise<SessionActionResult>;
      lockSession: () => Promise<SessionActionResult>;
      unlockSession: (input: UnlockSessionInput) => Promise<SessionActionResult>;
      closeSession: (input: CloseSessionInput) => Promise<CloseSessionResult>;
    };
  }
}

export {};
