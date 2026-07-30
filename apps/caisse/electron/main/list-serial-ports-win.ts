import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SerialPortOption = {
  path: string;
  manufacturer: string | null;
};

/** Ports COM Windows via .NET (sans module natif serialport). */
export async function listWindowsSerialPorts(): Promise<SerialPortOption[]> {
  if (process.platform !== "win32") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "[System.IO.Ports.SerialPort]::GetPortNames() -join [char]10",
      ],
      { timeout: 6_000, windowsHide: true },
    );

    const seen = new Set<string>();
    const ports: SerialPortOption[] = [];

    for (const line of stdout.split(/\r?\n/)) {
      const path = line.trim();
      if (!/^COM\d+$/i.test(path) || seen.has(path.toUpperCase())) continue;
      seen.add(path.toUpperCase());
      ports.push({ path, manufacturer: null });
    }

    return ports.sort((a, b) =>
      a.path.localeCompare(b.path, "fr", { numeric: true, sensitivity: "base" }),
    );
  } catch {
    return [];
  }
}
