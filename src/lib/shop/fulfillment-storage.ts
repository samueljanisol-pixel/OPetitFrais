import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";

const STORAGE_KEY = "opf-shop-fulfillment-v1";

export type ShopFulfillmentState = {
  mode: ShopFulfillmentMode | null;
};

export function readFulfillmentFromStorage(): ShopFulfillmentState {
  if (typeof window === "undefined") return { mode: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: null };
    const parsed = JSON.parse(raw) as { mode?: unknown };
    if (parsed.mode === "pickup" || parsed.mode === "home") {
      return { mode: parsed.mode };
    }
  } catch {
    /* ignore */
  }
  return { mode: null };
}

export function writeFulfillmentToStorage(state: ShopFulfillmentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
