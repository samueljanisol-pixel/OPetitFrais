import type { CuisineFrigoProduct } from "./types";

type ProductRelation = CuisineFrigoProduct | CuisineFrigoProduct[] | null | undefined;

export function normalizeProductRelation(raw: ProductRelation): CuisineFrigoProduct | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}
