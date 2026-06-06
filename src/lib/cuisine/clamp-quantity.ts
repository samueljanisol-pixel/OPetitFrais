export const CUISINE_QUANTITY_MIN = 1;

export function clampCuisineQuantity(value: number): number {
  if (!Number.isFinite(value)) return CUISINE_QUANTITY_MIN;
  return Math.max(CUISINE_QUANTITY_MIN, Math.round(value * 1000) / 1000);
}
