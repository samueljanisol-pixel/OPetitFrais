import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import { join } from "path";
import { loadRuntimeConfig, saveHardwareConfig } from "./load-config";
import {
  clearCachedCatalog,
  getCachedCatalog,
  prefetchCatalog,
} from "./fetch-catalog";
import { sendSaurusCatalogFromCache } from "./send-saurus-catalog";
import { pingConfiguredSaurusScale } from "./ping-saurus-scale";

const CASHIER_WIDTH = 1024;
const CASHIER_HEIGHT = 768;

const isDev = !app.isPackaged;

/** Fenêtre caisse plein écran utilisable — sans barre de titre ni menu OS. */
const KIOSK_WINDOW_OPTIONS = {
  frame: false,
  autoHideMenuBar: true,
  thickFrame: false,
} as const;

let cashierWindow: BrowserWindow | null = null;
let customerWindow: BrowserWindow | null = null;

/** Écran client : tout affichage autre que le principal (aucun si un seul écran). */
function getCustomerDisplay(): Electron.Display | null {
  const displays = screen.getAllDisplays();
  if (displays.length <= 1) return null;

  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== primary.id) ?? null;
}

function sendCartToCustomer(payload: unknown): void {
  if (!customerWindow || customerWindow.isDestroyed()) {
    return;
  }
  try {
    customerWindow.webContents.send("cart:update", payload);
  } catch {
    customerWindow = null;
  }
}

function createCashierWindow(): void {
  cashierWindow = new BrowserWindow({
    ...KIOSK_WINDOW_OPTIONS,
    width: CASHIER_WIDTH,
    height: CASHIER_HEIGHT,
    minWidth: CASHIER_WIDTH,
    minHeight: CASHIER_HEIGHT,
    maxWidth: CASHIER_WIDTH,
    maxHeight: CASHIER_HEIGHT,
    resizable: false,
    title: "O'petit frais — Caisse",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    cashierWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    cashierWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  cashierWindow.on("closed", () => {
    cashierWindow = null;
  });
}

function createCustomerWindow(): void {
  const target = getCustomerDisplay();
  if (!target) return;

  customerWindow = new BrowserWindow({
    ...KIOSK_WINDOW_OPTIONS,
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    show: false,
    title: "O'petit frais — Ecran client",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void customerWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/customer`);
  } else {
    void customerWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "customer",
    });
  }

  customerWindow.once("ready-to-show", () => {
    if (!customerWindow || customerWindow.isDestroyed()) return;
    customerWindow.setFullScreen(true);
    customerWindow.show();
  });

  customerWindow.on("closed", () => {
    customerWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  await prefetchCatalog();

  ipcMain.handle("caisse:getConfig", () => loadRuntimeConfig());

  ipcMain.handle("caisse:getInitialCatalog", () => getCachedCatalog());

  ipcMain.handle("caisse:refreshCatalogCache", async () => {
    clearCachedCatalog();
    return prefetchCatalog();
  });

  ipcMain.handle(
    "caisse:saveHardwareConfig",
    (_event, partial: { scalePort?: string; ticketPrinter?: string; saurusScaleIp?: string }) => {
      const scalePort = typeof partial?.scalePort === "string" ? partial.scalePort : undefined;
      const saurusScaleIp =
        typeof partial?.saurusScaleIp === "string" ? partial.saurusScaleIp : undefined;
      const ticketPrinter =
        typeof partial?.ticketPrinter === "string" ? partial.ticketPrinter : undefined;
      if (scalePort === undefined && ticketPrinter === undefined && saurusScaleIp === undefined) {
        return loadRuntimeConfig();
      }
      return saveHardwareConfig({
        ...(scalePort !== undefined ? { scalePort } : {}),
        ...(saurusScaleIp !== undefined ? { saurusScaleIp } : {}),
        ...(ticketPrinter !== undefined ? { ticketPrinter } : {}),
      });
    },
  );

  ipcMain.handle("caisse:sendSaurusCatalog", () => sendSaurusCatalogFromCache());

  ipcMain.handle("caisse:pingSaurusScale", () => pingConfiguredSaurusScale());

  ipcMain.handle("caisse:listPrinters", async () => {
    if (!cashierWindow || cashierWindow.isDestroyed()) {
      return [] as string[];
    }
    try {
      const printers = await cashierWindow.webContents.getPrintersAsync();
      return printers.map((p) => p.name).sort((a, b) => a.localeCompare(b, "fr"));
    } catch {
      return [] as string[];
    }
  });

  ipcMain.handle("caisse:quitApp", () => {
    app.quit();
  });

  createCashierWindow();
  createCustomerWindow();

  ipcMain.on("cart:update", (_event, payload: unknown) => {
    sendCartToCustomer(payload);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCashierWindow();
      createCustomerWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
