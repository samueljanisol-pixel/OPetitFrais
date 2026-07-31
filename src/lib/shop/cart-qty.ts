const KG_STEP = 0.5;
const UNIT_STEP = 1;

export function stepForUnit(unitCode: string): number {
  return unitCode === "kg" ? KG_STEP : UNIT_STEP;
}

export function addQtyByStep(current: number, step: number): number {
  const rounded = Math.round((current + step) / step) * step;
  return Math.round(rounded * 100) / 100;
}

export function subtractQtyByStep(current: number, step: number): number {
  const next = Math.round((current - step) / step) * step;
  const rounded = Math.round(next * 100) / 100;
  return rounded < step ? 0 : rounded;
}

export function minQtyForUnit(unitCode: string): number {
  return stepForUnit(unitCode);
}

export function roundQtyForUnit(qty: number, unitCode: string): number {
  const step = stepForUnit(unitCode);
  const rounded = Math.round(qty / step) * step;
  return Math.round(rounded * 100) / 100;
}

/** @deprecated Préférer convertCanonicalKgToQty / convertLineQtyToOption (shop-qty-convert). */
export function convertQtyOnUnitChange(qty: number, toUnitCode: string): number {
  if (qty <= 0) return 0;
  if (toUnitCode === "kg") {
    return roundQtyForUnit(qty, "kg");
  }
  return Math.max(0, Math.round(qty));
}

export function addQty(current: number, unitCode: string): number {
  return roundQtyForUnit(current + stepForUnit(unitCode), unitCode);
}

export function subtractQty(current: number, unitCode: string): number {
  const next = roundQtyForUnit(current - stepForUnit(unitCode), unitCode);
  const min = minQtyForUnit(unitCode);
  return next < min ? 0 : next;
}

export function salesUnitCode(raw: unknown): string {
  if (raw == null) return "unite";
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (row && typeof row === "object" && "code" in row) {
    const code = (row as { code?: string }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "unite";
}
