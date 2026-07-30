import cors from "cors";
import express from "express";
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

const PORT = Number(process.env.OPF_AGENT_PORT ?? 4711);
let scalePortConfigured: string | undefined;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  const scale = getScaleState();
  res.json({
    ok: true,
    service: "caisse-agent",
    scale: {
      source: scale.source,
      port: scale.port,
      connected: scale.connected,
    },
  });
});

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

app.get("/weight", (_req, res) => {
  res.json(weightPayload());
});

/** Flux SSE — mise à jour dès réception série (~50 ms). */
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

/** Dev : simuler un poids (mode mock ou test sans Arduino). */
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

/** Tare — envoie `T` à l'Arduino ou remet mock à 0. */
app.post("/weight/tare", async (_req, res) => {
  const ok = await sendTare();
  if (!ok) {
    res.status(503).json({ ok: false, error: "Tare impossible (serie)" });
    return;
  }
  res.json({ ok: true });
});

/** Reconnexion série (ex. après redémarrage tsx watch ou port bloqué). */
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
  console.log(
    `[print] ${buf.length} octets ESC/POS recus${printer ? ` → ${printer}` : ""}`,
  );

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

async function main(): Promise<void> {
  await stopScale();
  scalePortConfigured = await resolveScalePort();
  await startScale(scalePortConfigured);

  setInterval(() => {
    void tryReconnectScale();
  }, 3000);

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`Caisse agent http://127.0.0.1:${PORT}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[agent] port ${PORT} deja utilise — fermez l'autre instance caisse-agent`);
      process.exit(1);
    }
    throw err;
  });
}

function shutdown(): void {
  void stopScale().then(() => process.exit(0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
