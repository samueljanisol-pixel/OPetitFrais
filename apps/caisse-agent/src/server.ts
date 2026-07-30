import cors from "cors";
import express, { type Express } from "express";
import type { Server } from "node:http";
import {
  getScaleState,
  reconnectScale,
  sendTare,
  setMockWeightKg,
  startScale,
  stopScale,
  subscribeScaleReading,
} from "./scale-service.js";
import { resolveScalePort } from "./resolve-scale-port.js";
import { listSerialPorts } from "./list-serial-ports.js";
import { listPrinters } from "./list-printers.js";
import { printRawEscPos } from "./print-ticket.js";
import {
  getConfiguredTicketPrinter,
  loadCaisseLocalConfig,
  saveCaisseLocalConfig,
} from "./load-config.js";
import { setRuntimeHardwareConfig } from "./runtime-config.js";

export type CaisseAgentServerOptions = {
  port?: number;
  host?: string;
  onListen?: (url: string) => void;
  onError?: (err: Error) => void;
};

let httpServer: Server | null = null;
let reconnectTimer: ReturnType<typeof setInterval> | null = null;
let scalePortConfigured: string | undefined;

function weightPayload() {
  const scale = getScaleState();
  const r = scale.reading;
  return {
    ok: true,
    weightKg: r?.weightKg ?? 0,
    weightGrams: r?.weightGrams ?? 0,
    stable: r?.stable ?? false,
    source: scale.source,
    raw: r?.raw ?? null,
    connected: scale.connected,
    error: scale.lastError,
  };
}

async function tryReconnectScale(): Promise<void> {
  const scale = getScaleState();
  if (scale.source === "serial" && scale.connected && !scale.lastError) {
    return;
  }

  const port = await resolveScalePort();
  scalePortConfigured = port;
  if (!port) {
    return;
  }

  const next = await reconnectScale(port);
  if (next.source === "serial" && next.connected) {
    console.log(`[scale] reconnecte ${port}`);
  }
}

export function createCaisseAgentApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    const scale = getScaleState();
    res.json({
      ok: true,
      service: "caisse-agent",
      embedded: process.env.OPF_EMBEDDED_AGENT === "1",
      scale: {
        source: scale.source,
        port: scale.port,
        connected: scale.connected,
      },
    });
  });

  app.get("/weight", (_req, res) => {
    res.json(weightPayload());
  });

  app.get("/weight/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const push = () => {
      res.write(`data: ${JSON.stringify(weightPayload())}\n\n`);
    };

    push();
    const unsub = subscribeScaleReading(() => push());
    req.on("close", () => {
      unsub();
      res.end();
    });
  });

  app.post("/weight/mock", (req, res) => {
    const w = req.body?.weightKg;
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
      res.status(400).json({ ok: false, error: "weightKg invalide" });
      return;
    }
    const stable = req.body?.stable !== false;
    setMockWeightKg(w, stable);
    const scale = getScaleState();
    res.json({
      ok: true,
      weightKg: scale.reading?.weightKg ?? 0,
      stable: scale.reading?.stable ?? false,
    });
  });

  app.post("/weight/tare", async (_req, res) => {
    const ok = await sendTare();
    if (!ok) {
      res.status(503).json({ ok: false, error: "Tare impossible (serie)" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/weight/reconnect", async (req, res) => {
    const bodyPort = req.body?.scalePort;
    if (typeof bodyPort === "string" && bodyPort.trim().length > 0) {
      setRuntimeHardwareConfig({ scalePort: bodyPort.trim() });
    }

    const port = await resolveScalePort();
    scalePortConfigured = port;
    const scale = await reconnectScale(port);
    res.json({
      ok: scale.source === "serial" && scale.connected,
      source: scale.source,
      port: scale.port,
      connected: scale.connected,
      error: scale.lastError,
    });
  });

  app.get("/serial/ports", async (_req, res) => {
    try {
      const ports = await listSerialPorts();
      res.json({ ok: true, ports });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur liste ports";
      res.status(500).json({ ok: false, error: msg, ports: [] });
    }
  });

  app.get("/printers", async (_req, res) => {
    try {
      const printers = await listPrinters();
      res.json({ ok: true, printers });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur liste imprimantes";
      res.status(500).json({ ok: false, error: msg, printers: [] });
    }
  });

  app.get("/config/hardware", (_req, res) => {
    const config = loadCaisseLocalConfig();
    res.json({
      ok: true,
      scalePort: config.scalePort,
      ticketPrinter: getConfiguredTicketPrinter(),
    });
  });

  app.post("/config/hardware", async (req, res) => {
    const partial: { scalePort?: string; ticketPrinter?: string } = {};

    if (typeof req.body?.scalePort === "string") {
      partial.scalePort = req.body.scalePort;
    }
    if (typeof req.body?.ticketPrinter === "string") {
      partial.ticketPrinter = req.body.ticketPrinter;
    }

    if (partial.scalePort === undefined && partial.ticketPrinter === undefined) {
      res.status(400).json({ ok: false, error: "scalePort ou ticketPrinter requis" });
      return;
    }

    setRuntimeHardwareConfig(partial);
    const saved = saveCaisseLocalConfig(partial);

    let scaleConnected = getScaleState().connected;
    if (partial.scalePort !== undefined) {
      const port = await resolveScalePort();
      scalePortConfigured = port;
      const scale = await reconnectScale(port);
      scaleConnected = scale.source === "serial" && scale.connected;
    }

    res.json({
      ok: true,
      scalePort: saved.scalePort,
      ticketPrinter: saved.ticketPrinter,
      scaleConnected,
    });
  });

  app.post("/print", async (req, res) => {
    const raw = req.body?.dataBase64;
    if (typeof raw !== "string" || raw.length === 0) {
      res.status(400).json({ ok: false, error: "dataBase64 requis" });
      return;
    }
    const buf = Buffer.from(raw, "base64");
    const fromBody =
      typeof req.body?.ticketPrinter === "string" ? req.body.ticketPrinter.trim() : "";
    const printer = fromBody || getConfiguredTicketPrinter();

    if (!printer || printer.trim().length === 0) {
      res.status(503).json({
        ok: false,
        error: "Imprimante ticket non configurée (Menu → Paramètres)",
      });
      return;
    }

    try {
      await printRawEscPos(printer, buf);
      res.json({ ok: true, bytes: buf.length, printer });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impression impossible";
      console.error("[print]", msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return app;
}

export async function startCaisseAgentServer(
  options: CaisseAgentServerOptions = {},
): Promise<{ url: string; port: number }> {
  if (httpServer) {
    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : options.port ?? 4711;
    return { url: `http://${options.host ?? "127.0.0.1"}:${port}`, port };
  }

  const port = options.port ?? Number(process.env.OPF_AGENT_PORT ?? 4711);
  const host = options.host ?? "127.0.0.1";

  await stopScale();
  scalePortConfigured = await resolveScalePort();
  await startScale(scalePortConfigured);

  if (reconnectTimer) {
    clearInterval(reconnectTimer);
  }
  reconnectTimer = setInterval(() => {
    void tryReconnectScale();
  }, 3000);

  const agentApp = createCaisseAgentApp();

  return new Promise((resolve, reject) => {
    const server = agentApp.listen(port, host, () => {
      httpServer = server;
      const url = `http://${host}:${port}`;
      console.log(`Caisse agent ${url}`);
      options.onListen?.(url);
      resolve({ url, port });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        const msg = `[agent] port ${port} deja utilise`;
        console.warn(msg);
        options.onError?.(err);
        reject(err);
        return;
      }
      options.onError?.(err);
      reject(err);
    });
  });
}

export async function stopCaisseAgentServer(): Promise<void> {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }

  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
    httpServer = null;
  }

  await stopScale();
}
