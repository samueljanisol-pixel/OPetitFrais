import templates from "./templates.json";

export const SAURUS_RECORD_SIZE = 64;
export const SAURUS_PLU_PER_PACKET = 4;
export const SAURUS_PACKET_SIZE = 261;

export type SaurusPluItem = {
  plu: number;
  name: string;
  priceCents: number;
  unitKg: boolean;
  flag: number;
};

function decodeTemplate(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export const SAURUS_INIT_PACKETS: Buffer[] = templates.init.map(decodeTemplate);
export const SAURUS_FINAL_PACKETS: Buffer[] = templates.final.map(decodeTemplate);

function priceToBcd(cents: number): [number, number] {
  const clamped = Math.max(0, Math.min(9999, Math.round(cents)));
  const s = String(clamped).padStart(4, "0").slice(-4);
  const hi = (Number(s[0]) << 4) | Number(s[1]);
  const lo = (Number(s[2]) << 4) | Number(s[3]);
  return [hi, lo];
}

function packetHeaderByte0(packetIndex: number): number {
  if (packetIndex === 0) return 0x0b;
  if (packetIndex < 0xf6) return 0x01;
  return 0x02;
}

function encodeRecord(item: SaurusPluItem, recordHeader: readonly [number, number, number]): Buffer {
  const rec = Buffer.alloc(SAURUS_RECORD_SIZE, 0);
  rec[0] = recordHeader[0];
  rec[1] = recordHeader[1];
  rec[2] = recordHeader[2];
  const name = item.name.toUpperCase().slice(0, 36).padEnd(36, " ");
  rec.write(name, 3, 36, "ascii");
  rec[39] = 0;
  rec.writeUInt16BE(item.plu, 40);
  rec[44] = 0x21;
  rec[45] = 0x02;
  const [hi, lo] = priceToBcd(item.priceCents);
  rec[48] = hi;
  rec[49] = lo;
  rec[50] = item.unitKg ? 0x04 : 0x0c;
  rec[58] = item.flag & 0xff;
  return rec;
}

export function blankSaurusPluItem(): SaurusPluItem {
  return { plu: 0, name: "", priceCents: 0, unitKg: true, flag: 0 };
}

function buildPluPacket(items: SaurusPluItem[], packetIndex: number, seqCounter: number): Buffer {
  const buf = Buffer.alloc(SAURUS_PACKET_SIZE, 0);
  for (let slot = 0; slot < SAURUS_PLU_PER_PACKET; slot++) {
    const item = items[slot] ?? blankSaurusPluItem();
    let header: [number, number, number];
    if (slot === 0) {
      const b0 = packetHeaderByte0(packetIndex);
      const b1 = packetIndex === 0 ? 0 : packetIndex;
      header = [b0, b1, 0];
    } else {
      header = [0, 0, slot + 1];
    }
    const rec = encodeRecord(item, header);
    rec.copy(buf, slot * SAURUS_RECORD_SIZE);
  }
  const body = buf.subarray(0, 256);
  const bodySum = body.reduce((sum, b) => sum + b, 0);
  buf[256] = 0;
  buf[257] = 0;
  buf[258] = seqCounter & 0xff;
  buf[259] = ((bodySum & 0xff) + (seqCounter & 0xff)) & 0xff;
  buf[260] = (bodySum >> 8) & 0xff;
  return buf;
}

export function buildSaurusPluPackets(items: SaurusPluItem[]): Buffer[] {
  const packets: Buffer[] = [];
  let seq = 5;
  const blank = blankSaurusPluItem();
  for (let packetIndex = 0; packetIndex * SAURUS_PLU_PER_PACKET < items.length; packetIndex++) {
    const start = packetIndex * SAURUS_PLU_PER_PACKET;
    const chunk = items.slice(start, start + SAURUS_PLU_PER_PACKET);
    while (chunk.length < SAURUS_PLU_PER_PACKET) {
      chunk.push(blank);
    }
    packets.push(buildPluPacket(chunk, packetIndex, seq));
    seq += 4;
  }
  return packets;
}
