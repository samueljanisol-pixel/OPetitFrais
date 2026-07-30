import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import {
  getIdentityConfigStatus,
  loadRuntimeConfig,
  saveHardwareConfig,
  saveIdentityConfig,
  type CaisseIdentityConfig,
} from "./load-config";
import {
  clearCachedCatalog,
  getCachedCatalog,
  prefetchCatalog,
} from "./fetch-catalog";
import { listWindowsSerialPorts } from "./list-serial-ports-win";
import { sendSaurusCatalogFromCache } from "./send-saurus-catalog";
import { pingConfiguredSaurusScale } from "./ping-saurus-scale";
import {
  getCaisseUpdateState,
  initCaisseUpdate,
  installCaisseUpdate,
  startCaisseUpdateChecks,
  triggerCaisseUpdateCheck,
} from "./caisse-update";
import { startEmbeddedCaisseAgent, stopEmbeddedCaisseAgent } from "./embedded-agent";

const CASHIER_WIDTH = 1024;
const CASHIER_HEIGHT = 768;
const SETUP_WIDTH = 440;
const SETUP_HEIGHT = 560;

const isDev = !app.isPackaged;

function appIconPath(): string | undefined {
  const candidates = [
    join(__dirname, "../../build/icon.png"),
    join(process.cwd(), "apps", "caisse", "build", "icon.png"),
    join(process.cwd(), "build", "icon.png"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function loadAppIcon(): Electron.NativeImage | undefined {
  const path = appIconPath();
  if (!path) return undefined;
  const image = nativeImage.createFromPath(path);
  return image.isEmpty() ? undefined : image;
}

/** Fenêtre caisse plein écran utilisable — sans barre de titre ni menu OS. */
const KIOSK_WINDOW_OPTIONS = {
  frame: false,
  autoHideMenuBar: true,
  thickFrame: false,
} as const;

let cashierWindow: BrowserWindow | null = null;
let customerWindow: BrowserWindow | null = null;
let identityReady = false;

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

function applyWindowMode(mode: "setup" | "caisse"): void {
  if (!cashierWindow || cashierWindow.isDestroyed()) return;

  if (mode === "setup") {
    cashierWindow.setMinimumSize(SETUP_WIDTH, SETUP_HEIGHT);
    cashierWindow.setMaximumSize(SETUP_WIDTH, SETUP_HEIGHT);
    cashierWindow.setSize(SETUP_WIDTH, SETUP_HEIGHT);
    cashierWindow.setResizable(false);
    cashierWindow.center();
    return;
  }

  cashierWindow.setMinimumSize(CASHIER_WIDTH, CASHIER_HEIGHT);
  cashierWindow.setMaximumSize(CASHIER_WIDTH, CASHIER_HEIGHT);
  cashierWindow.setSize(CASHIER_WIDTH, CASHIER_HEIGHT);
  cashierWindow.setResizable(false);
  cashierWindow.center();
}

function createCashierWindow(initialMode: "setup" | "caisse"): void {
  const isSetup = initialMode === "setup";
  const icon = loadAppIcon();

  cashierWindow = new BrowserWindow({
    ...KIOSK_WINDOW_OPTIONS,
    ...(icon ? { icon } : {}),
    width: isSetup ? SETUP_WIDTH : CASHIER_WIDTH,
    height: isSetup ? SETUP_HEIGHT : CASHIER_HEIGHT,
    minWidth: isSetup ? SETUP_WIDTH : CASHIER_WIDTH,
    minHeight: isSetup ? SETUP_HEIGHT : CASHIER_HEIGHT,
    maxWidth: isSetup ? SETUP_WIDTH : CASHIER_WIDTH,
    maxHeight: isSetup ? SETUP_HEIGHT : CASHIER_HEIGHT,
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
  if (!identityReady) return;

  const target = getCustomerDisplay();
  if (!target) return;
  if (customerWindow && !customerWindow.isDestroyed()) return;

  const icon = loadAppIcon();

  customerWindow = new BrowserWindow({
    ...KIOSK_WINDOW_OPTIONS,
    ...(icon ? { icon } : {}),
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

  await startEmbeddedCaisseAgent();

  const identityStatus = getIdentityConfigStatus();
  identityReady = identityStatus.complete;

  if (identityReady) {
    await prefetchCatalog();
  }

  ipcMain.handle("caisse:getConfig", () => loadRuntimeConfig());

  ipcMain.handle("caisse:getIdentityStatus", () => getIdentityConfigStatus());

  ipcMain.handle("caisse:saveIdentityConfig", (_event, identity: CaisseIdentityConfig) => {
    return saveIdentityConfig(identity);
  });

  ipcMain.handle("caisse:notifyIdentityReady", async () => {
    identityReady = true;
    clearCachedCatalog();
    await prefetchCatalog();
    createCustomerWindow();
    applyWindowMode("caisse");
    void triggerCaisseUpdateCheck();
    startCaisseUpdateChecks();
  });

  ipcMain.handle("caisse:setWindowMode", (_event, mode: unknown) => {
    if (mode === "setup" || mode === "caisse") {
      applyWindowMode(mode);
    }
  });

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
      const printers = await Promise.race([
        cashierWindow.webContents.getPrintersAsync(),
        new Promise<Electron.PrinterInfo[]>((resolve) => {
          setTimeout(() => resolve([]), 6_000);
        }),
      ]);
      return printers.map((p) => p.name).sort((a, b) => a.localeCompare(b, "fr"));
    } catch {
      return [] as string[];
    }
  });

  ipcMain.handle("caisse:listSerialPorts", async () => listWindowsSerialPorts());

  ipcMain.handle("caisse:quitApp", () => {
    app.quit();
  });

  ipcMain.handle("caisse:getUpdateState", () => getCaisseUpdateState());

  ipcMain.handle("caisse:checkForUpdate", async () => {
    await triggerCaisseUpdateCheck();
    return getCaisseUpdateState();
  });

  ipcMain.handle("caisse:installUpdate", () => installCaisseUpdate());

  createCashierWindow(identityReady ? "caisse" : "setup");
  initCaisseUpdate(() => cashierWindow);
  if (identityReady) {
    startCaisseUpdateChecks();
  }
  createCustomerWindow();

  ipcMain.on("cart:update", (_event, payload: unknown) => {
    sendCartToCustomer(payload);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const status = getIdentityConfigStatus();
      identityReady = status.complete;
      createCashierWindow(status.complete ? "caisse" : "setup");
      createCustomerWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopEmbeddedCaisseAgent();
});
