import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";
import type { ShopPaymentMethod } from "@/lib/shop/payment-types";
import { parseStoredCartLines } from "@/lib/shop/cart-prune";
import type { ShopCartLine } from "@/lib/shop/types";
import type { ShopCartSyncResult } from "@/lib/shop/cart-sync-server";

export type ShopCartSyncPayload = {
  action: "create" | "sync" | "clear" | "submit";
  visitorKey: string;
  cartId?: string | null;
  lines?: ShopCartLine[];
  fulfillmentMode?: ShopFulfillmentMode | null;
  paymentMethod?: ShopPaymentMethod | null;
  orderComment?: string;
};

function parseSyncResponseLines(raw: unknown): ShopCartLine[] {
  return parseStoredCartLines(raw);
}

export async function syncShopCartToServer(
  payload: ShopCartSyncPayload,
): Promise<ShopCartSyncResult | null> {
  try {
    const res = await fetch("/api/shop/cart/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      cartId?: string;
      cartNumber?: number;
      lines?: unknown;
    };
    if (typeof json.cartId !== "string" || typeof json.cartNumber !== "number") return null;
    const lines = parseSyncResponseLines(json.lines);
    return { cartId: json.cartId, cartNumber: json.cartNumber, lines };
  } catch {
    return null;
  }
}
