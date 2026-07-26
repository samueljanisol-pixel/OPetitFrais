/** Fuseau « jour métier » pour le ticket caisse (plan : Europe/Paris). */
export const CAISSE_TICKET_TZ = "Europe/Paris";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date du jour (YYYY-MM-DD) au fuseau ticket. */
export function todayTicketDateIso(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAISSE_TICKET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function isValidTicketDateIso(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [ys, ms, ds] = value.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Jour civil (YYYY-MM-DD) d’un timestamp ISO dans le fuseau ticket. */
export function ticketDateIsoFromTimestamp(isoTimestamp: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAISSE_TICKET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(isoTimestamp));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** Indique si un timestamp ISO tombe dans le jour `dateIso` (fuseau ticket). */
export function timestampOnTicketDay(isoTimestamp: string, dateIso: string): boolean {
  return ticketDateIsoFromTimestamp(isoTimestamp) === dateIso;
}
