import type { ShopCartLine, ShopCartState } from "@/lib/shop/types";
import { shopOptionKey } from "@/lib/shop/shop-order-options";

export const SHOP_CART_STORAGE_KEY = "opf-shop-cart-v2";

export function emptyCart(): ShopCartState {
  return { lines: [] };
}

function parseLine(raw: unknown): ShopCartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.productId !== "string") return null;
  if (typeof l.qty !== "number") return null;
  if (typeof l.unitCode !== "string") return null;
  if (typeof l.priceAtAdd !== "number") return null;
  if (typeof l.unitLabel !== "string") return null;
  const shopOrderUnitId =
    l.shopOrderUnitId === null || typeof l.shopOrderUnitId === "string" ? l.shopOrderUnitId : null;
  const equivKgAtAdd =
    l.equivKgAtAdd === null || typeof l.equivKgAtAdd === "number" ? l.equivKgAtAdd : null;
  const canonicalKg =
    l.canonicalKg === null || typeof l.canonicalKg === "number" ? l.canonicalKg : null;
  const comment = typeof l.comment === "string" ? l.comment : undefined;
  return {
    productId: l.productId,
    shopOrderUnitId,
    qty: l.qty,
    unitCode: l.unitCode,
    unitLabel: l.unitLabel,
    priceAtAdd: l.priceAtAdd,
    equivKgAtAdd,
    canonicalKg,
    comment,
  };
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
      .map(parseLine)
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

export function cartLineKey(line: Pick<ShopCartLine, "productId" | "shopOrderUnitId">): string {
  return `${line.productId}::${shopOptionKey(line.shopOrderUnitId)}`;
}

export function upsertCartLine(lines: ShopCartLine[], line: ShopCartLine): ShopCartLine[] {
  const key = cartLineKey(line);
  const idx = lines.findIndex((l) => cartLineKey(l) === key);
  if (line.qty <= 0) {
    if (idx < 0) return lines;
    return lines.filter((_, i) => i !== idx);
  }
  if (idx < 0) return [...lines, line];
  const next = [...lines];
  const existing = next[idx];
  next[idx] = {
    ...line,
    comment: line.comment !== undefined ? line.comment : existing.comment,
  };
  return next;
}

export function getCartLineQty(
  lines: ShopCartLine[],
  productId: string,
  shopOrderUnitId: string | null,
): number {
  return (
    lines.find(
      (l) => l.productId === productId && l.shopOrderUnitId === shopOrderUnitId,
    )?.qty ?? 0
  );
}

export function getProductCartLine(
  lines: ShopCartLine[],
  productId: string,
): ShopCartLine | undefined {
  return lines.find((l) => l.productId === productId);
}

export function removeProductFromCart(lines: ShopCartLine[], productId: string): ShopCartLine[] {
  return lines.filter((l) => l.productId !== productId);
}
