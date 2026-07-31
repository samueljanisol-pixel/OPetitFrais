import type { ShopPaymentMethod } from "@/lib/shop/payment-types";

const STORAGE_KEY = "opf-shop-payment-v1";

export type ShopPaymentState = {
  method: ShopPaymentMethod | null;
};

export function readPaymentFromStorage(): ShopPaymentState {
  if (typeof window === "undefined") return { method: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { method: null };
    const parsed = JSON.parse(raw) as { method?: unknown };
    if (parsed.method === "cash" || parsed.method === "card") {
      return { method: parsed.method };
    }
  } catch {
    /* ignore */
  }
  return { method: null };
}

export function writePaymentToStorage(state: ShopPaymentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearPaymentStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
