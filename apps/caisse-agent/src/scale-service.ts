import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import {
  parseScaleLine,
  SCALE_TARE_COMMAND,
  type ScaleReading,
} from "./scale-protocol.js";

export type ScaleSource = "serial" | "mock";

export type ScaleState = {
  source: ScaleSource;
  port: string | null;
  reading: ScaleReading | null;
  connected: boolean;
  lastError: string | null;
};

let mockGrams = 0;
let mockStable = false;

let state: ScaleState = {
  source: "mock",
  port: null,
  reading: null,
  connected: false,
  lastError: null,
};

let serialPort: SerialPort | null = null;

type ScaleReadingListener = (reading: ScaleReading) => void;
const readingListeners = new Set<ScaleReadingListener>();

export function subscribeScaleReading(listener: ScaleReadingListener): () => void {
  readingListeners.add(listener);
  return () => readingListeners.delete(listener);
}

function setReading(reading: ScaleReading): void {
  state = { ...state, reading, lastError: null };
  for (const listener of readingListeners) {
    listener(reading);
  }
}

export function getScaleState(): ScaleState {
  if (state.source === "mock") {
    const reading: ScaleReading = {
      weightGrams: mockGrams,
      weightKg: mockGrams / 1000,
      stable: mockStable,
      raw: `${mockGrams};${mockStable ? "S" : "U"}`,
      updatedAt: new Date().toISOString(),
    };
    return { ...state, reading, connected: true };
  }
  return state;
}

export function setMockWeightKg(weightKg: number, stable = true): void {
  mockGrams = Math.round(weightKg * 1000);
  mockStable = stable;
  if (state.source === "mock") {
    const reading: ScaleReading = {
      weightGrams: mockGrams,
      weightKg: mockGrams / 1000,
      stable: mockStable,
      raw: `${mockGrams};${mockStable ? "S" : "U"}`,
      updatedAt: new Date().toISOString(),
    };
    for (const listener of readingListeners) {
      listener(reading);
    }
  }
}

export async function startScale(portPath: string | undefined): Promise<void> {
  if (!portPath || portPath.trim().length === 0) {
    state = {
      source: "mock",
      port: null,
      reading: null,
      connected: true,
      lastError: null,
    };
    console.log("[scale] mode mock (OPF_SCALE_PORT non defini)");
    return;
  }

  const baudRate = Number(process.env.OPF_SCALE_BAUD ?? 115200);

  await new Promise<void>((resolve) => {
    serialPort = new SerialPort({ path: portPath, baudRate, autoOpen: false });

    serialPort.open((err) => {
      if (err) {
        state = {
          source: "mock",
          port: portPath,
          reading: null,
          connected: false,
          lastError: err.message,
        };
        console.error(`[scale] ouverture ${portPath} echouee:`, err.message);
        console.log("[scale] repli mode mock");
        resolve();
        return;
      }

      const parser = serialPort!.pipe(new ReadlineParser({ delimiter: "\n" }));
      parser.on("data", (line: string) => {
        const parsed = parseScaleLine(line);
        if (parsed) {
          setReading(parsed);
        }
      });

      serialPort!.on("error", (e) => {
        state = { ...state, lastError: e.message, connected: false };
        console.error("[scale] erreur serie:", e.message);
      });

      serialPort!.on("close", () => {
        state = { ...state, connected: false, lastError: "Port serie ferme" };
        console.error("[scale] port serie ferme");
      });

      state = {
        source: "serial",
        port: portPath,
        reading: null,
        connected: true,
        lastError: null,
      };
      console.log(`[scale] serie ${portPath} @ ${baudRate} baud`);
      resolve();
    });
  });
}

export async function sendTare(): Promise<boolean> {
  if (state.source === "mock") {
    mockGrams = 0;
    mockStable = true;
    return true;
  }
  if (!serialPort?.isOpen) {
    return false;
  }
  return new Promise((resolve) => {
    serialPort!.write(SCALE_TARE_COMMAND, (err) => {
      resolve(!err);
    });
  });
}

export async function stopScale(): Promise<void> {
  if (serialPort?.isOpen) {
    await new Promise<void>((resolve) => {
      serialPort!.close(() => resolve());
    });
  }
  serialPort = null;
}

export async function reconnectScale(portPath: string | undefined): Promise<ScaleState> {
  await stopScale();
  await startScale(portPath);
  return getScaleState();
}
