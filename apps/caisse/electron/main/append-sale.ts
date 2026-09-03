import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  emptyDayFile,
  emptyMonthFile,
  localDateKeys,
  mergeSaleIntoDayFile,
  mergeSaleIntoMonthFile,
  parseDayFile,
  parseMonthFile,
  type VentesSaleInput,
} from "@opf/caisse-core";
import { getOpenSessionForSale, recordCardTicketOnOpenSession } from "./caisse-session";
import { ventesLocalDir } from "./ventes-paths";

export type AppendSalePayload = VentesSaleInput & {
  magasinCode: string;
  caisseCode: string;
};

export type AppendSaleResult =
  | { ok: true; dayFile: string; monthFile: string }
  | { ok: false; error: string };

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => T): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export { ventesLocalDir, ventesUserDataRoot } from "./ventes-paths";

function readJsonUnknown(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    renameSync(tmp, path);
  } catch {
    if (existsSync(path)) {
      unlinkSync(path);
    }
    renameSync(tmp, path);
  }
}

function asSaleInput(payload: AppendSalePayload): VentesSaleInput | null {
  if (!payload || typeof payload !== "object") return null;
  const ticketRef = typeof payload.ticketRef === "string" ? payload.ticketRef.trim() : "";
  if (!ticketRef) return null;
  const soldAt = typeof payload.soldAt === "string" ? payload.soldAt : "";
  if (!soldAt) return null;
  if (!Array.isArray(payload.lines) || !Array.isArray(payload.payments)) return null;
  const total = typeof payload.total === "number" && Number.isFinite(payload.total) ? payload.total : null;
  if (total == null) return null;
  const ticketNumber =
    typeof payload.ticketNumber === "number" && Number.isFinite(payload.ticketNumber)
      ? payload.ticketNumber
      : 0;
  const open = getOpenSessionForSale();

  return {
    soldAt,
    ticketNumber,
    ticketRef,
    total,
    clientId: typeof payload.clientId === "string" ? payload.clientId : null,
    clientName: typeof payload.clientName === "string" ? payload.clientName : null,
    isDelivery: payload.isDelivery === true,
    clotureRef:
      typeof payload.clotureRef === "string" && payload.clotureRef.trim()
        ? payload.clotureRef
        : (open?.clotureRef ?? null),
    caissierId:
      typeof payload.caissierId === "string" && payload.caissierId.trim()
        ? payload.caissierId
        : (open?.caissierId ?? null),
    caissierName:
      typeof payload.caissierName === "string" && payload.caissierName.trim()
        ? payload.caissierName
        : (open?.caissierName ?? null),
    lines: payload.lines,
    payments: payload.payments,
  };
}

function appendSaleSync(payload: AppendSalePayload): AppendSaleResult {
  const magasinCode = typeof payload.magasinCode === "string" ? payload.magasinCode.trim() : "";
  const caisseCode = typeof payload.caisseCode === "string" ? payload.caisseCode.trim() : "";
  if (!magasinCode || !caisseCode) {
    return { ok: false, error: "Magasin ou caisse manquant pour la sauvegarde vente" };
  }

  const sale = asSaleInput(payload);
  if (!sale) {
    return { ok: false, error: "Vente invalide (ticket ou total manquant)" };
  }

  const dir = ventesLocalDir(magasinCode, caisseCode);
  mkdirSync(dir, { recursive: true });

  const keys = localDateKeys(sale.soldAt);
  const dayPath = join(dir, `ventes_${keys.day}.json`);
  const monthPath = join(dir, `ventes_${keys.month}.json`);

  const day = parseDayFile(readJsonUnknown(dayPath)) || emptyDayFile();
  const nextDay = mergeSaleIntoDayFile(day, sale);
  if (nextDay === day) {
    return { ok: true, dayFile: dayPath, monthFile: monthPath };
  }

  const month = parseMonthFile(readJsonUnknown(monthPath)) || emptyMonthFile();
  const nextMonth = mergeSaleIntoMonthFile(month, sale);

  writeJsonAtomic(dayPath, nextDay);
  writeJsonAtomic(monthPath, nextMonth);

  const hasCard = sale.payments.some((p) => p.mode === "card" && p.amount > 0.001);
  recordCardTicketOnOpenSession(hasCard);

  return { ok: true, dayFile: dayPath, monthFile: monthPath };
}

export function appendSaleToLocalJson(payload: AppendSalePayload): Promise<AppendSaleResult> {
  return enqueueWrite(() => {
    try {
      return appendSaleSync(payload);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Sauvegarde vente locale impossible",
      };
    }
  });
}
