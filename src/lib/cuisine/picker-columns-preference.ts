export const CUISINE_PICKER_COLUMNS_MIN = 3;
export const CUISINE_PICKER_COLUMNS_MAX = 8;
export const CUISINE_PICKER_COLUMNS_DEFAULT = 5;
export const CUISINE_PICKER_COLUMNS_STORAGE_KEY = "cuisine.picker.columnsPerRow";

export const CUISINE_PICKER_COLUMN_OPTIONS = [3, 4, 5, 6, 7, 8] as const;

export type CuisinePickerColumnCount = (typeof CUISINE_PICKER_COLUMN_OPTIONS)[number];

export function clampPickerColumns(value: number): CuisinePickerColumnCount {
  const rounded = Math.round(value);
  if (rounded <= CUISINE_PICKER_COLUMNS_MIN) return CUISINE_PICKER_COLUMNS_MIN;
  if (rounded >= CUISINE_PICKER_COLUMNS_MAX) return CUISINE_PICKER_COLUMNS_MAX;
  return rounded as CuisinePickerColumnCount;
}

export function readPickerColumnsFromStorage(): CuisinePickerColumnCount {
  if (typeof window === "undefined") return CUISINE_PICKER_COLUMNS_DEFAULT;
  const raw = localStorage.getItem(CUISINE_PICKER_COLUMNS_STORAGE_KEY);
  if (raw == null) return CUISINE_PICKER_COLUMNS_DEFAULT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return CUISINE_PICKER_COLUMNS_DEFAULT;
  return clampPickerColumns(parsed);
}

export function writePickerColumnsToStorage(value: CuisinePickerColumnCount): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUISINE_PICKER_COLUMNS_STORAGE_KEY, String(value));
}
