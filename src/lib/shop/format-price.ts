import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";

export function formatShopPriceDh(locale: AppLocale, price: number, estimated = false): string {
  const formatted = `${formatNumber(locale, price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
  return estimated ? `~${formatted}` : formatted;
}

export function formatShopPriceWithUnit(
  locale: AppLocale,
  price: number,
  unitLabel: string,
  estimated = false,
): string {
  return `${formatShopPriceDh(locale, price, estimated)} / ${unitLabel}`;
}

export function formatShopQty(locale: AppLocale, qty: number, unitCode: string): string {
  const isKg = unitCode === "kg";
  return formatNumber(locale, qty, {
    minimumFractionDigits: isKg && qty % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: isKg ? 2 : 0,
  });
}

export function formatShopKgEstimate(locale: AppLocale, kg: number): string {
  const formatted = formatNumber(locale, kg, {
    minimumFractionDigits: kg % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: 2,
  });
  return locale === "ar-MA" ? `~${formatted} كغ` : `~${formatted} kg`;
}

export function formatShopPieceWeightHint(locale: AppLocale, pieceWeightKg: number): string {
  const formatted = formatNumber(locale, pieceWeightKg, {
    minimumFractionDigits: pieceWeightKg % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: 2,
  });
  return locale === "ar-MA" ? `~${formatted} كغ / حبة` : `~${formatted} kg / pièce`;
}
