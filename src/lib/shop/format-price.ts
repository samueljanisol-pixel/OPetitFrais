import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";

export function formatShopPriceDh(locale: AppLocale, price: number): string {
  return `${formatNumber(locale, price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}

export function formatShopPriceWithUnit(locale: AppLocale, price: number, unitLabel: string): string {
  return `${formatShopPriceDh(locale, price)} / ${unitLabel}`;
}

export function formatShopQty(locale: AppLocale, qty: number, unitCode: string): string {
  const isKg = unitCode === "kg";
  return formatNumber(locale, qty, {
    minimumFractionDigits: isKg && qty % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: isKg ? 2 : 0,
  });
}
