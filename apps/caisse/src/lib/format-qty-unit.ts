import { formatDecimalFr, formatWeightKgFr } from "@opf/caisse-core";

/** Libellé d’unité pour prix / vignettes (`kg` ou `Unité`). */
export function salesUnitLabel(salesUnit: "kg" | "unit" | string): string {
  return salesUnit === "kg" ? "kg" : "Unité";
}

/** @deprecated Préférer salesUnitLabel */
export function salesUnitShortLabel(salesUnit: "kg" | "unit" | string): string {
  return salesUnitLabel(salesUnit);
}

/** Quantité + unité (`1,250 kg` ou `2 Unité(s)`). */
export function formatQtyWithUnit(
  qty: number,
  salesUnit: "kg" | "unit" | string,
): string {
  if (salesUnit === "kg") {
    return `${formatWeightKgFr(qty)} kg`;
  }
  return `${formatDecimalFr(qty, 3)} Unité(s)`;
}
