import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { app } from "electron";
import { formatClotureReference } from "@opf/caisse-core";
import { verifyCaissePin } from "@opf/caisse-core/caisse-pin";
import { loadRuntimeConfig } from "./load-config";
import { findCachedCaissier } from "./fetch-caissiers";
import { ventesLocalDir } from "./ventes-paths";
import {
  emptyClosedSession,
  formatCaissierDisplayName,
  type CaisseClotureRecord,
  type CaisseSessionPublic,
  type CloseSessionInput,
  type SessionActionResult,
} from "../../shared/caisse-session";

type PersistedOpenSession = {
  status: "open" | "locked";
  magasinCode: string;
  caisseCode: string;
  clotureNumber: number;
  clotureRef: string;
  caissierId: string;
  caissierName: string;
  openedAt: string;
  cardTicketCount: number;
};

type PersistedState = {
  session: PersistedOpenSession | { status: "closed" };
};

type CounterMap = Record<string, number>;

let bootLocked = false;
let memory: PersistedState | null = null;

function sessionPath(): string {
  return join(app.getPath("userData"), "caisse-session.json");
}

function counterPath(): string {
  return join(app.getPath("userData"), "caisse-cloture-counter.json");
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

function readJsonUnknown(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function parseOpenSession(raw: unknown): PersistedOpenSession | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const status = row.status === "locked" ? "locked" : row.status === "open" ? "open" : null;
  if (!status) return null;
  const clotureNumber =
    typeof row.clotureNumber === "number" && Number.isFinite(row.clotureNumber) ? row.clotureNumber : 0;
  const clotureRef = typeof row.clotureRef === "string" ? row.clotureRef.trim() : "";
  const caissierId = typeof row.caissierId === "string" ? row.caissierId.trim() : "";
  const caissierName = typeof row.caissierName === "string" ? row.caissierName.trim() : "";
  const openedAt = typeof row.openedAt === "string" ? row.openedAt : "";
  const magasinCode = typeof row.magasinCode === "string" ? row.magasinCode : "";
  const caisseCode = typeof row.caisseCode === "string" ? row.caisseCode : "";
  if (!clotureRef || !caissierId || !openedAt) return null;
  const cardTicketCount =
    typeof row.cardTicketCount === "number" && Number.isFinite(row.cardTicketCount)
      ? Math.max(0, Math.round(row.cardTicketCount))
      : 0;
  return {
    status,
    magasinCode,
    caisseCode,
    clotureNumber,
    clotureRef,
    caissierId,
    caissierName,
    openedAt,
    cardTicketCount,
  };
}

function readState(): PersistedState {
  if (memory) return memory;
  const raw = readJsonUnknown(sessionPath());
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const row = raw as Record<string, unknown>;
    const sessionRaw = "session" in row ? row.session : row;
    const open = parseOpenSession(sessionRaw);
    if (open) {
      memory = { session: open };
      return memory;
    }
  }
  memory = { session: { status: "closed" } };
  return memory;
}

function persist(state: PersistedState): void {
  memory = state;
  writeJsonAtomic(sessionPath(), state);
}

function toPublic(state: PersistedState): CaisseSessionPublic {
  if (state.session.status === "closed") return emptyClosedSession();
  const s = state.session;
  return {
    status: s.status,
    clotureNumber: s.clotureNumber,
    clotureRef: s.clotureRef,
    caissierId: s.caissierId,
    caissierName: s.caissierName,
    openedAt: s.openedAt,
    cardTicketCount: s.cardTicketCount,
  };
}

function counterKey(magasinCode: string, caisseCode: string): string {
  return `${magasinCode.trim()}:${caisseCode.trim()}`;
}

function nextClotureNumber(magasinCode: string, caisseCode: string): number {
  const raw = readJsonUnknown(counterPath());
  const map: CounterMap =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as CounterMap) } : {};
  const key = counterKey(magasinCode, caisseCode);
  const prev = typeof map[key] === "number" && Number.isFinite(map[key]) ? map[key] : 0;
  const next = prev >= 0 ? prev + 1 : 1;
  map[key] = next;
  writeJsonAtomic(counterPath(), map);
  return next;
}

export function getCaisseSession(): CaisseSessionPublic {
  const state = readState();
  if (!bootLocked && state.session.status === "open") {
    bootLocked = true;
    const locked: PersistedState = { session: { ...state.session, status: "locked" } };
    persist(locked);
    return toPublic(locked);
  }
  bootLocked = true;
  return toPublic(state);
}

export async function openCaisseSession(userId: string, pin: string): Promise<SessionActionResult> {
  const state = readState();
  if (state.session.status !== "closed") {
    return { ok: false, error: "La caisse est déjà ouverte" };
  }

  const caissier = findCachedCaissier(userId);
  if (!caissier) {
    return { ok: false, error: "Caissier introuvable sur ce poste" };
  }
  const ok = await verifyCaissePin(pin, caissier.pinHash);
  if (!ok) {
    return { ok: false, error: "Code incorrect" };
  }

  const config = loadRuntimeConfig();
  const magasinCode = config.magasinCode.trim();
  const caisseCode = config.caisseCode.trim();
  if (!magasinCode || !caisseCode) {
    return { ok: false, error: "Magasin ou caisse non configuré" };
  }

  const clotureNumber = nextClotureNumber(magasinCode, caisseCode);
  const clotureRef = formatClotureReference(magasinCode, caisseCode, clotureNumber);
  const next: PersistedState = {
    session: {
      status: "open",
      magasinCode,
      caisseCode,
      clotureNumber,
      clotureRef,
      caissierId: caissier.userId,
      caissierName: formatCaissierDisplayName(caissier.prenom, caissier.nom),
      openedAt: new Date().toISOString(),
      cardTicketCount: 0,
    },
  };
  persist(next);
  return { ok: true, session: toPublic(next) };
}

export function lockCaisseSession(): SessionActionResult {
  const state = readState();
  if (state.session.status !== "open") {
    return { ok: false, error: "La caisse n'est pas ouverte" };
  }
  const next: PersistedState = { session: { ...state.session, status: "locked" } };
  persist(next);
  return { ok: true, session: toPublic(next) };
}

export async function unlockCaisseSession(pin: string): Promise<SessionActionResult> {
  const state = readState();
  if (state.session.status !== "locked") {
    return { ok: false, error: "La caisse n'est pas verrouillée" };
  }
  const caissier = findCachedCaissier(state.session.caissierId);
  const hash = caissier?.pinHash;
  if (!hash) {
    return { ok: false, error: "Caissier introuvable — actualisez la liste (réseau requis)" };
  }
  const ok = await verifyCaissePin(pin, hash);
  if (!ok) {
    return { ok: false, error: "Code incorrect" };
  }
  const next: PersistedState = { session: { ...state.session, status: "open" } };
  persist(next);
  return { ok: true, session: toPublic(next) };
}

function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 0 ? n : null;
}

function appendClotureRecord(magasinCode: string, caisseCode: string, record: CaisseClotureRecord): void {
  const dir = ventesLocalDir(magasinCode, caisseCode);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "clotures.json");
  const raw = readJsonUnknown(path);
  const list = Array.isArray(raw) ? [...raw] : [];
  if (list.some((row) => row && typeof row === "object" && (row as { clotureRef?: string }).clotureRef === record.clotureRef)) {
    return;
  }
  list.push(record);
  writeJsonAtomic(path, list);
}

export type CloseSessionResult =
  | { ok: true; session: CaisseSessionPublic; cloture: CaisseClotureRecord }
  | { ok: false; error: string };

export function closeCaisseSession(input: CloseSessionInput): CloseSessionResult {
  const state = readState();
  if (state.session.status === "closed") {
    return { ok: false, error: "La caisse est déjà fermée" };
  }

  const bills50 = asCount(input.bills50);
  const bills20 = asCount(input.bills20);
  const coins10 = asCount(input.coins10);
  if (bills50 == null || bills20 == null || coins10 == null) {
    return { ok: false, error: "Saisie fonds de caisse invalide" };
  }

  const s = state.session;
  const record: CaisseClotureRecord = {
    clotureRef: s.clotureRef,
    clotureNumber: s.clotureNumber,
    caissierId: s.caissierId,
    caissierName: s.caissierName,
    openedAt: s.openedAt,
    closedAt: new Date().toISOString(),
    bills50,
    bills20,
    coins10,
    drawerTotal: bills50 * 50 + bills20 * 20 + coins10 * 10,
    cardTicketCount: s.cardTicketCount,
  };
  appendClotureRecord(s.magasinCode, s.caisseCode, record);
  persist({ session: { status: "closed" } });
  return { ok: true, session: emptyClosedSession(), cloture: record };
}

export function getOpenSessionForSale(): PersistedOpenSession | null {
  const state = readState();
  if (state.session.status === "closed") return null;
  return state.session;
}

export function recordCardTicketOnOpenSession(hasCardPayment: boolean): void {
  if (!hasCardPayment) return;
  const state = readState();
  if (state.session.status === "closed") return;
  persist({
    session: {
      ...state.session,
      cardTicketCount: state.session.cardTicketCount + 1,
    },
  });
}

export function getLastClotureRecord(): CaisseClotureRecord | null {
  const config = loadRuntimeConfig();
  const path = join(ventesLocalDir(config.magasinCode, config.caisseCode), "clotures.json");
  const raw = readJsonUnknown(path);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const last = raw[raw.length - 1];
  if (!last || typeof last !== "object") return null;
  return last as CaisseClotureRecord;
}
