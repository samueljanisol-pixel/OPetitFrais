import { intlLocale, type AppLocale } from "@/i18n/config";

const CASABLANCA_TZ = "Africa/Casablanca";

/** Date du jour journal (YYYY-MM-DD) au fuseau Casablanca. */
export function todayJournalDateIso(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CASABLANCA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function formatJournalDateLabel(locale: AppLocale, isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: CASABLANCA_TZ,
  }).format(d);
}

/** Libellé court pour mobile (ex. « sam. 6 juin »). */
export function formatJournalDateLabelCompact(locale: AppLocale, isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: CASABLANCA_TZ,
  }).format(d);
}

/** Affichage chip date (JJ/MM). */
export function formatJournalDateChip(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  if (!m || !d) return isoDate;
  return `${d}/${m}`;
}

export function formatJournalTime(locale: AppLocale, isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CASABLANCA_TZ,
  }).format(d);
}

export function shiftJournalDateIso(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
