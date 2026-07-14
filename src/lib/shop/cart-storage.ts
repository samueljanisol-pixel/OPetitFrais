import type { ShopCartLine, ShopCartState } from "@/lib/shop/types";

export const SHOP_CART_STORAGE_KEY = "opf-shop-cart-v1";

export function emptyCart(): ShopCartState {
  return { lines: [] };
}

export function readCartFromStorage(): ShopCartState {
  if (typeof window === "undefined") return emptyCart();
  try {
    const raw = window.localStorage.getItem(SHOP_CART_STORAGE_KEY);
    if (!raw) return emptyCart();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as ShopCartState).lines)) {
      return emptyCart();
    }
    const lines = ((parsed as ShopCartState).lines as unknown[])
      .map((line) => {
        if (!line || typeof line !== "object") return null;
        const l = line as ShopCartLine;
        if (
          typeof l.productId !== "string" ||
          typeof l.qty !== "number" ||
          typeof l.unitCode !== "string" ||
          typeof l.priceAtAdd !== "number"
        ) {
          return null;
        }
        return l;
      })
      .filter((l): l is ShopCartLine => l != null);
    return { lines };
  } catch {
    return emptyCart();
  }
}

export function writeCartToStorage(cart: ShopCartState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHOP_CART_STORAGE_KEY, JSON.stringify(cart));
}

export function upsertCartLine(lines: ShopCartLine[], line: ShopCartLine): ShopCartLine[] {
  const idx = lines.findIndex((l) => l.productId === line.productId);
  if (line.qty <= 0) {
    if (idx < 0) return lines;
    return lines.filter((_, i) => i !== idx);
  }
  if (idx < 0) return [...lines, line];
  const next = [...lines];
  next[idx] = line;
  return next;
}

export function getCartLineQty(lines: ShopCartLine[], productId: string): number {
  return lines.find((l) => l.productId === productId)?.qty ?? 0;
}
