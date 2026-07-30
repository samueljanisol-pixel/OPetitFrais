import { SerialPort } from "serialport";

const ports = await SerialPort.list();
for (const p of ports) {
  console.log(
    `${p.path}\t${p.manufacturer ?? ""}\t${p.vendorId ?? ""}:${p.productId ?? ""}\t${p.serialNumber ?? ""}`,
  );
}
