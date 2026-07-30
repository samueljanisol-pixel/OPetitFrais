import { SerialPort } from "serialport";

export type SerialPortInfo = {
  path: string;
  manufacturer: string | null;
  vendorId: string | null;
  productId: string | null;
};

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const ports = await SerialPort.list();
  return ports
    .map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? null,
      vendorId: p.vendorId ?? null,
      productId: p.productId ?? null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "fr"));
}
