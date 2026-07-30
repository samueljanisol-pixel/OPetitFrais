/// <reference types="vite/client" />

import type {
  CartBroadcast,
  CaisseHardwareConfig,
  CaisseRuntimeConfig,
  InitialCatalogPayload,
  PingSaurusScaleResult,
  SendSaurusCatalogResult,
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
      getInitialCatalog: () => Promise<InitialCatalogPayload | null>;
      refreshCatalogCache: () => Promise<InitialCatalogPayload>;
      saveHardwareConfig: (partial: CaisseHardwareConfig) => Promise<CaisseRuntimeConfig>;
      sendSaurusCatalog: () => Promise<SendSaurusCatalogResult>;
      pingSaurusScale: () => Promise<PingSaurusScaleResult>;
      listPrinters: () => Promise<string[]>;
      quitApp: () => Promise<void>;
      broadcastCart: (payload: CartBroadcast) => void;
      onCartUpdate: (handler: (payload: CartBroadcast) => void) => () => void;
    };
  }
}

export {};
