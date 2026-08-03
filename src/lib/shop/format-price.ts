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

/** Quantité + libellé unité : « × » uniquement pour les unités vitrine, pas Kg / UdV. */
export function formatShopQtyWithUnitLabel(
  qtyFormatted: string,
  unitLabel: string,
  shopOrderUnitId: string | null,
  unitCode: string,
): string {
  const unit = unitLabel.trim() || (unitCode === "kg" ? "kg" : "unité");
  if (unitCode === "kg" || shopOrderUnitId == null) {
    return `${qtyFormatted} ${unit}`;
  }
  return `${qtyFormatted} × ${unit}`;
}

export type ShopLineQtyFields = {
  qty: number;
  unitCode?: string;
  unitLabel?: string;
  shopOrderUnitId?: string | null;
  equivKgAtAdd?: number | null;
};

/** Libellé quantité commande boutique (ex. « 2 × 1 pièce », « 1,5 kg »). */
export function formatShopLineQtyParts(
  line: ShopLineQtyFields,
  locale: AppLocale,
): { qtyLabel: string; kgHint: string | null } {
  const unitCode = line.unitCode ?? "unit";
  const formatted = formatShopQty(locale, line.qty, unitCode);
  const unit = (line.unitLabel ?? "").trim() || (unitCode === "kg" ? "kg" : "unité");
  const qtyLabel = formatShopQtyWithUnitLabel(
    formatted,
    unit,
    line.shopOrderUnitId ?? null,
    unitCode,
  );
  let kgHint: string | null = null;
  if (line.equivKgAtAdd != null && line.equivKgAtAdd > 0 && line.shopOrderUnitId != null) {
    const totalKg = line.qty * line.equivKgAtAdd;
    const soit = locale === "ar-MA" ? "أي" : "soit";
    kgHint = `${soit} ${formatShopKgEstimate(locale, totalKg)}`;
  }
  return { qtyLabel, kgHint };
}

export function formatShopLineQtyLabel(line: ShopLineQtyFields, locale: AppLocale): string {
  const { qtyLabel, kgHint } = formatShopLineQtyParts(line, locale);
  return kgHint ? `${qtyLabel} (${kgHint})` : qtyLabel;
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
