import dgram from "node:dgram";
import { SAURUS_SCALE_UDP_PORT } from "./setting";
import {
  buildSaurusPluPackets,
  SAURUS_FINAL_PACKETS,
  SAURUS_INIT_PACKETS,
  type SaurusPluItem,
} from "./protocol";

const ACK_BYTE = 0x02;
const PACKET_TIMEOUT_MS = 3000;
const PING_TIMEOUT_MS = 1500;
const PLU_PACKET_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sendAndWaitAck(
  socket: dgram.Socket,
  payload: Buffer,
  host: string,
  port: number,
  timeoutMs = PACKET_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(ok);
    };

    const onMessage = (msg: Buffer) => {
      if (msg.length === 1 && msg[0] === ACK_BYTE) {
        finish(true);
        return;
      }
      if (payload[0] === 0x0e && msg.length >= 50) {
        finish(true);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.on("message", onMessage);
    socket.send(payload, port, host, (err) => {
      if (err) finish(false);
    });
  });
}

/** Ping léger — premier paquet d'initialisation, attente ACK UDP. */
export async function pingSaurusScale(host: string): Promise<boolean> {
  const probe = SAURUS_INIT_PACKETS[0];
  if (!probe) return false;

  const socket = dgram.createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.bind(0, () => resolve());
      socket.once("error", reject);
    });
    return await sendAndWaitAck(socket, probe, host, SAURUS_SCALE_UDP_PORT, PING_TIMEOUT_MS);
  } catch {
    return false;
  } finally {
    socket.close();
  }
}

export type UploadSaurusCatalogResult =
  | {
      ok: true;
      productCount: number;
      pluPacketCount: number;
    }
  | {
      ok: false;
      error: string;
    };

export async function uploadSaurusCatalog(
  host: string,
  items: SaurusPluItem[],
): Promise<UploadSaurusCatalogResult> {
  if (items.length === 0) {
    return { ok: false, error: "Aucun article à envoyer" };
  }

  const pluPackets = buildSaurusPluPackets(items);
  const socket = dgram.createSocket("udp4");

  try {
    await new Promise<void>((resolve, reject) => {
      socket.bind(0, () => resolve());
      socket.once("error", reject);
    });

    for (let i = 0; i < SAURUS_INIT_PACKETS.length; i++) {
      const ok = await sendAndWaitAck(socket, SAURUS_INIT_PACKETS[i]!, host, SAURUS_SCALE_UDP_PORT);
      if (!ok) {
        return {
          ok: false,
          error: `Pas de réponse balance (initialisation ${i + 1}/${SAURUS_INIT_PACKETS.length})`,
        };
      }
    }

    for (let i = 0; i < pluPackets.length; i++) {
      const ok = await sendAndWaitAck(socket, pluPackets[i]!, host, SAURUS_SCALE_UDP_PORT);
      if (!ok) {
        return {
          ok: false,
          error: `Pas de réponse balance (catalogue ${i + 1}/${pluPackets.length})`,
        };
      }
      if (i + 1 < pluPackets.length) {
        await sleep(PLU_PACKET_DELAY_MS);
      }
    }

    for (let i = 0; i < SAURUS_FINAL_PACKETS.length; i++) {
      const ok = await sendAndWaitAck(socket, SAURUS_FINAL_PACKETS[i]!, host, SAURUS_SCALE_UDP_PORT);
      if (!ok) {
        return {
          ok: false,
          error: `Pas de réponse balance (finalisation ${i + 1}/${SAURUS_FINAL_PACKETS.length})`,
        };
      }
    }

    return {
      ok: true,
      productCount: items.length,
      pluPacketCount: pluPackets.length,
    };
  } finally {
    socket.close();
  }
}
