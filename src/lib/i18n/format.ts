import { intlLocale, type AppLocale } from "@/i18n/config";

export function formatNumber(locale: AppLocale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatDate(
  locale: AppLocale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(d);
}

export function formatCurrency(locale: AppLocale, value: number, currency = "MAD"): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function compareStrings(locale: AppLocale, a: string, b: string): number {
  return a.localeCompare(b, locale === "ar-MA" ? "ar" : "fr", { sensitivity: "base" });
}
