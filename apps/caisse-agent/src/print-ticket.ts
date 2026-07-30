import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Envoi RAW via winspool — sans StartPagePrinter (requis pour ESC/POS Epson).
 * Fallback : copy /b vers le port USB/COM de l'imprimante.
 */
const PRINT_PS = String.raw`
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class OpfRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    var di = new DOCINFOA { pDocName = "OPF Ticket", pDataType = "RAW" };
    if (!StartDocPrinter(hPrinter, 1, di)) {
      ClosePrinter(hPrinter);
      return false;
    }
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, p, bytes.Length);
      int written = 0;
      bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
      EndDocPrinter(hPrinter);
      ClosePrinter(hPrinter);
      return ok && written == bytes.Length;
    } finally {
      Marshal.FreeCoTaskMem(p);
    }
  }

  public static void CopyToPort(string portName, string filePath) {
    var port = portName.TrimEnd(':');
    var dest = "\\\\.\\" + port;
    var src = Path.GetFullPath(filePath);
    var psi = new System.Diagnostics.ProcessStartInfo("cmd.exe", "/c copy /b \"" + src + "\" \"" + dest + "\"")
    {
      UseShellExecute = false,
      CreateNoWindow = true,
      RedirectStandardOutput = true,
      RedirectStandardError = true
    };
    using (var proc = System.Diagnostics.Process.Start(psi)) {
      proc.WaitForExit(15000);
      if (proc.ExitCode != 0) {
        var err = proc.StandardError.ReadToEnd();
        throw new Exception("copy /b vers " + dest + " a echoue: " + err);
      }
    }
  }
}
'@

$file = $env:OPF_PRINT_FILE
$name = $env:OPF_PRINTER_NAME
if (-not (Test-Path -LiteralPath $file)) { throw "Fichier ticket introuvable" }
$bytes = [System.IO.File]::ReadAllBytes($file)

$ok = [OpfRawPrint]::SendBytesToPrinter($name, $bytes)
if ($ok) { exit 0 }

$port = (Get-Printer -Name $name -ErrorAction Stop).PortName
if (-not $port) { throw "WritePrinter a echoue et port introuvable pour $name" }
[OpfRawPrint]::CopyToPort($port, $file)
`;

/** Envoie des octets ESC/POS bruts vers une imprimante Windows. */
export async function printRawEscPos(printerName: string, data: Buffer): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Impression ticket disponible uniquement sur Windows");
  }
  const trimmed = printerName.trim();
  if (trimmed.length === 0) {
    throw new Error("Aucune imprimante ticket configurée");
  }

  const tmpFile = join(tmpdir(), `opf-ticket-${randomBytes(8).toString("hex")}.bin`);
  writeFileSync(tmpFile, data);

  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", PRINT_PS],
      {
        timeout: 45_000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          OPF_PRINTER_NAME: trimmed,
          OPF_PRINT_FILE: tmpFile,
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Impression impossible";
    throw new Error(msg);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}
