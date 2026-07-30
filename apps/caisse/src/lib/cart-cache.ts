import type { CartLine, CartState, SalesUnitKind } from "@opf/caisse-core";
import { createEmptyCart } from "@opf/caisse-core";

const CACHE_VERSION = 1;
const CACHE_PREFIX = "opf-caisse-cart-v1";

type CachedCartPayload = {
  version: typeof CACHE_VERSION;
  savedAt: string;
  cart: CartState;
};

function cacheKey(magasinCode: string, caisseCode: string): string {
  return `${CACHE_PREFIX}:${magasinCode.trim()}:${caisseCode.trim()}`;
}

function isSalesUnit(v: unknown): v is SalesUnitKind {
  return v === "kg" || v === "unit";
}

function isCartLine(v: unknown): v is CartLine {
  if (v == null || typeof v !== "object") return false;
  const row = v as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.productId === "string" &&
    typeof row.productCode === "string" &&
    typeof row.productName === "string" &&
    typeof row.categoryLabel === "string" &&
    typeof row.qty === "number" &&
    Number.isFinite(row.qty) &&
    typeof row.unitPrice === "number" &&
    Number.isFinite(row.unitPrice) &&
    typeof row.lineTotal === "number" &&
    Number.isFinite(row.lineTotal) &&
    isSalesUnit(row.salesUnit)
  );
}

export function normalizeCartState(raw: unknown): CartState | null {
  if (raw == null || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.lines)) return null;

  const lines: CartLine[] = [];
  for (const entry of data.lines) {
    if (!isCartLine(entry)) return null;
    lines.push(entry);
  }

  const clientId = typeof data.clientId === "string" ? data.clientId : null;
  const clientName = typeof data.clientName === "string" ? data.clientName : null;

  return { lines, clientId, clientName };
}

export function loadCachedCart(magasinCode: string, caisseCode: string): CartState | null {
  if (typeof window === "undefined" || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(magasinCode, caisseCode));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedCartPayload;
    if (parsed.version !== CACHE_VERSION) return null;

    return normalizeCartState(parsed.cart);
  } catch {
    return null;
  }
}

export function saveCachedCart(magasinCode: string, caisseCode: string, cart: CartState): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  const payload: CachedCartPayload = {
    version: CACHE_VERSION,
    savedAt: new Date().toISOString(),
    cart,
  };

  try {
    window.localStorage.setItem(cacheKey(magasinCode, caisseCode), JSON.stringify(payload));
  } catch {
    // Quota ou mode privé — ignorer
  }
}

export function clearCachedCart(magasinCode: string, caisseCode: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(cacheKey(magasinCode, caisseCode));
  } catch {
    // ignore
  }
}

export function emptyCartState(): CartState {
  return createEmptyCart();
}

export type CartDisplayRow =
  | { type: "category"; key: string; label: string }
  | { type: "line"; key: string; line: CartLine };

export function cartRowsWithCategories(lines: readonly CartLine[]): CartDisplayRow[] {
  const rows: CartDisplayRow[] = [];
  let lastCategory = "";

  for (const line of lines) {
    if (line.categoryLabel !== lastCategory) {
      rows.push({
        type: "category",
        key: `cat-${line.categoryLabel}`,
        label: line.categoryLabel,
      });
      lastCategory = line.categoryLabel;
    }
    rows.push({ type: "line", key: line.id, line });
  }

  return rows;
}
