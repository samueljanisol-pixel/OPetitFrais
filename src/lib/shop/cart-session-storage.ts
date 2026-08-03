export const SHOP_CART_SESSION_STORAGE_KEY = "opf-shop-cart-session-v1";

export type ShopCartSession = {
  cartId: string;
  cartNumber: number;
};

export function readCartSessionFromStorage(): ShopCartSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHOP_CART_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { cartId, cartNumber } = parsed as ShopCartSession;
    if (typeof cartId !== "string" || typeof cartNumber !== "number") return null;
    return { cartId, cartNumber };
  } catch {
    return null;
  }
}

export function writeCartSessionToStorage(session: ShopCartSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHOP_CART_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearCartSessionStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SHOP_CART_SESSION_STORAGE_KEY);
}
