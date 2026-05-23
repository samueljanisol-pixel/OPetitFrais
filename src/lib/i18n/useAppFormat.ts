"use client";

import { useLocale } from "next-intl";
import { formatDate, formatNumber, formatCurrency, compareStrings } from "@/lib/i18n/format";
import { normalizeLocale, type AppLocale } from "@/i18n/config";

export function useAppFormat() {
  const locale = normalizeLocale(useLocale());

  return {
    locale,
    formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(locale, value, options),
    formatDateTime: (value: Date | string | number) =>
      formatDate(locale, value, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(locale, value, options),
    formatCurrency: (value: number, currency?: string) => formatCurrency(locale, value, currency),
    compareStrings: (a: string, b: string) => compareStrings(locale, a, b),
  };
}

export function useAppLocale(): AppLocale {
  return normalizeLocale(useLocale());
}
