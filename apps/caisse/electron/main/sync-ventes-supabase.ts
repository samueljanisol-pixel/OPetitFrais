import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { app, BrowserWindow } from "electron";
import { computeClotureSnapshot, parseDayFile, type VentesTicket } from "@opf/caisse-core";
import type { CaisseClotureRecord } from "../../shared/caisse-session";
import { getSyncBackofficeUrl, loadRuntimeConfig } from "./load-config";
import { ventesLocalDir, ventesUserDataRoot } from "./ventes-paths";

const FLUSH_INTERVAL_MS = 2 * 60 * 1000;
const TICKET_BATCH = 20;

type TicketQueueItem = {
  kind: "ticket";
  id: string;
  magasinCode: string;
  caisseCode: string;
  payload: {
    ticketRef: string;
    ticketNumber: number;
    soldAt: string;
    total: number;
    clientId: string | null;
    clientName: string | null;
    isDelivery: boolean;
    clotureRef: string | null;
    caissierId: string | null;
    caissierName: string | null;
    lines: VentesTicket["lines"];
    payments: VentesTicket["payments"];
  };
};

type ClotureQueueItem = {
  kind: "cloture";
  id: string;
  payload: {
    clotureRef: string;
    clotureNumber: number;
    magasinCode: string;
    caisseCode: string;
    caissierId: string;
    caissierName: string;
    openedAt: string;
    closedAt: string;
    bills50: number;
    bills20: number;
    coins10: number;
    drawerTotal: number;
    snapshot: ReturnType<typeof computeClotureSnapshot>;
  };
};

type QueueItem = TicketQueueItem | ClotureQueueItem;

type QueueState = { items: QueueItem[] };

let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let cashierWin: BrowserWindow | null = null;

function queuePath(): string {
  try {
    return join(app.getPath("userData"), "ventes-supabase-queue.json");
  } catch {
    return join(process.cwd(), "ventes-supabase-queue.json");
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    renameSync(tmp, path);
  } catch {
    if (existsSync(path)) unlinkSync(path);
    renameSync(tmp, path);
  }
}

function readQueue(): QueueState {
  if (!existsSync(queuePath())) return { items: [] };
  try {
    const raw = JSON.parse(readFileSync(queuePath(), "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { items: [] };
    const items = (raw as { items?: unknown }).items;
    if (!Array.isArray(items)) return { items: [] };
    return { items: items as QueueItem[] };
  } catch {
    return { items: [] };
  }
}

function persistQueue(state: QueueState): void {
  writeJsonAtomic(queuePath(), state);
  broadcastQueueCount(state.items.length);
}

function broadcastQueueCount(count: number): void {
  if (!cashierWin || cashierWin.isDestroyed()) return;
  cashierWin.webContents.send("caisse:supabase-queue-count", count);
}

function readJsonUnknown(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function collectTicketsForCloture(
  magasinCode: string,
  caisseCode: string,
  clotureRef: string,
): VentesTicket[] {
  const dir = ventesLocalDir(magasinCode, caisseCode);
  if (!existsSync(dir) || !clotureRef) return [];
  const names = readdirSync(dir).filter((name) => /^ventes_\d{4}-\d{2}-\d{2}\.json$/.test(name));
  const tickets: VentesTicket[] = [];
  for (const name of names) {
    const parsed = parseDayFile(readJsonUnknown(join(dir, name)));
    if (!parsed) continue;
    for (const ticket of parsed.tickets) {
      if (ticket.clotureRef === clotureRef) tickets.push(ticket);
    }
  }
  return tickets;
}

function enqueue(item: QueueItem): void {
  const state = readQueue();
  if (state.items.some((row) => row.id === item.id && row.kind === item.kind)) {
    return;
  }
  state.items.push(item);
  persistQueue(state);
}

export function enqueueTicketForSupabase(
  magasinCode: string,
  caisseCode: string,
  sale: VentesTicket,
): void {
  enqueue({
    kind: "ticket",
    id: sale.ticketRef,
    magasinCode,
    caisseCode,
    payload: {
      ticketRef: sale.ticketRef,
      ticketNumber: sale.ticketNumber,
      soldAt: sale.soldAt,
      total: sale.total,
      clientId: sale.clientId,
      clientName: sale.clientName,
      isDelivery: sale.isDelivery,
      clotureRef: sale.clotureRef ?? null,
      caissierId: sale.caissierId ?? null,
      caissierName: sale.caissierName ?? null,
      lines: sale.lines,
      payments: sale.payments,
    },
  });
}

export function enqueueClotureForSupabase(
  magasinCode: string,
  caisseCode: string,
  record: CaisseClotureRecord,
): void {
  const tickets = collectTicketsForCloture(magasinCode, caisseCode, record.clotureRef);
  enqueue({
    kind: "cloture",
    id: record.clotureRef,
    payload: {
      clotureRef: record.clotureRef,
      clotureNumber: record.clotureNumber,
      magasinCode,
      caisseCode,
      caissierId: record.caissierId,
      caissierName: record.caissierName,
      openedAt: record.openedAt,
      closedAt: record.closedAt,
      bills50: record.bills50,
      bills20: record.bills20,
      coins10: record.coins10,
      drawerTotal: record.drawerTotal,
      snapshot: computeClotureSnapshot(tickets),
    },
  });
}

function asClotureRecord(raw: unknown): CaisseClotureRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const clotureRef = typeof row.clotureRef === "string" ? row.clotureRef.trim() : "";
  const openedAt = typeof row.openedAt === "string" ? row.openedAt : "";
  const closedAt = typeof row.closedAt === "string" ? row.closedAt : "";
  if (!clotureRef || !openedAt || !closedAt) return null;
  const asCount = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return {
    clotureRef,
    clotureNumber: asCount(row.clotureNumber),
    caissierId: typeof row.caissierId === "string" ? row.caissierId : "",
    caissierName: typeof row.caissierName === "string" ? row.caissierName : "",
    openedAt,
    closedAt,
    bills50: asCount(row.bills50),
    bills20: asCount(row.bills20),
    coins10: asCount(row.coins10),
    drawerTotal:
      typeof row.drawerTotal === "number" && Number.isFinite(row.drawerTotal) ? row.drawerTotal : 0,
    saleCount: asCount(row.saleCount),
    cardTicketCount: asCount(row.cardTicketCount),
  };
}

function enqueuePersistedVentesForSupabase(): void {
  const root = ventesUserDataRoot();
  if (!existsSync(root)) return;
  for (const magEnt of readdirSync(root, { withFileTypes: true })) {
    if (!magEnt.isDirectory()) continue;
    const magasinCode = magEnt.name.replace(/^M/i, "");
    const magDir = join(root, magEnt.name);
    for (const caisseEnt of readdirSync(magDir, { withFileTypes: true })) {
      if (!caisseEnt.isDirectory()) continue;
      const caisseCode = caisseEnt.name.replace(/^C/i, "");
      const dir = join(magDir, caisseEnt.name);
      const dayNames = readdirSync(dir).filter((name) => /^ventes_\d{4}-\d{2}-\d{2}\.json$/.test(name));
      for (const name of dayNames) {
        const parsed = parseDayFile(readJsonUnknown(join(dir, name)));
        for (const ticket of parsed.tickets) {
          enqueueTicketForSupabase(magasinCode, caisseCode, ticket);
        }
      }
      const clotureRaw = readJsonUnknown(join(dir, "clotures.json"));
      if (!Array.isArray(clotureRaw)) continue;
      for (const row of clotureRaw) {
        const record = asClotureRecord(row);
        if (record) enqueueClotureForSupabase(magasinCode, caisseCode, record);
      }
    }
  }
}

async function postJson(path: string, body: unknown): Promise<boolean> {
  const config = loadRuntimeConfig();
  const base = getSyncBackofficeUrl();
  const token = config.caisseToken.trim();
  if (!base || !token) {
    console.warn("[caisse-sync] URL ou token manquant, envoi annulé", { base: Boolean(base) });
    return false;
  }
  const url = `${base}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-caisse-ticket-token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[caisse-sync] POST ${path} → ${res.status}`, text.slice(0, 300));
      return false;
    }
    try {
      const json = JSON.parse(text) as { ok?: unknown };
      if (json.ok === true) return true;
    } catch {
      /* réponse non JSON */
    }
    console.warn(`[caisse-sync] POST ${path} : réponse inattendue`, text.slice(0, 300));
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur réseau";
    console.warn(`[caisse-sync] POST ${path} échoué : ${message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function getSupabaseQueueCount(): number {
  return readQueue().items.length;
}

export async function flushVentesSupabaseQueue(): Promise<void> {
  if (flushing) return;
  const state = readQueue();
  if (state.items.length === 0) {
    broadcastQueueCount(0);
    return;
  }
  flushing = true;
  try {
    const remaining: QueueItem[] = [];
    const tickets = state.items.filter((item): item is TicketQueueItem => item.kind === "ticket");
    const clotures = state.items.filter((item): item is ClotureQueueItem => item.kind === "cloture");

    for (let i = 0; i < tickets.length; i += TICKET_BATCH) {
      const batch = tickets.slice(i, i + TICKET_BATCH);
      const ok = await postJson("/api/caisse/ventes", {
        tickets: batch.map((item) => ({
          ...item.payload,
          magasinCode: item.magasinCode,
          caisseCode: item.caisseCode,
        })),
      });
      if (ok) continue;
      remaining.push(...tickets.slice(i));
      remaining.push(...clotures);
      persistQueue({ items: remaining });
      return;
    }

    for (const item of clotures) {
      const ok = await postJson("/api/caisse/clotures", item.payload);
      if (ok) continue;
      remaining.push(item, ...clotures.slice(clotures.indexOf(item) + 1));
      persistQueue({ items: remaining });
      return;
    }

    persistQueue({ items: [] });
  } finally {
    flushing = false;
  }
}

export function startVentesSupabaseSync(win: BrowserWindow | null): void {
  cashierWin = win;
  if (flushTimer) clearInterval(flushTimer);
  enqueuePersistedVentesForSupabase();
  flushTimer = setInterval(() => {
    void flushVentesSupabaseQueue();
  }, FLUSH_INTERVAL_MS);
  void flushVentesSupabaseQueue();
}

export function stopVentesSupabaseSync(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  cashierWin = null;
}
