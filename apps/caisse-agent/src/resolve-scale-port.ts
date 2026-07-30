import { SerialPort } from "serialport";
import { loadCaisseLocalConfig } from "./load-config.js";
import { getRuntimeScalePort } from "./runtime-config.js";

/** Détecte l'adaptateur CH340 (wch.cn) de la balance Arduino. */
export async function detectCh340Port(): Promise<string | undefined> {
  const ports = await SerialPort.list();
  const match = ports.find(
    (p) =>
      p.vendorId?.toLowerCase() === "1a86" ||
      p.manufacturer?.toLowerCase().includes("wch"),
  );
  return match?.path;
}

export async function resolveScalePort(): Promise<string | undefined> {
  const envPort = process.env.OPF_SCALE_PORT?.trim();
  if (envPort) return envPort;

  const runtimePort = getRuntimeScalePort()?.trim();
  if (runtimePort) return runtimePort;

  const config = loadCaisseLocalConfig();
  if (config.scalePort) return config.scalePort;

  const detected = await detectCh340Port();
  if (detected) {
    console.log(`[scale] port auto-detecte: ${detected}`);
  }
  return detected;
}
