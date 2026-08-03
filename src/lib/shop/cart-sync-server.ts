import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";
import type { ShopPaymentMethod } from "@/lib/shop/payment-types";
import {
  parseStoredCartLines,
  pruneCartLinesForShopCatalog,
  serializeCartLinesForDb,
} from "@/lib/shop/cart-prune";
import type { ShopCartLine } from "@/lib/shop/types";
import { recordShopHeartbeat, todayCasablancaIsoDate } from "@/lib/shop/analytics-server";

export type ShopCartSyncResult = {
  cartId: string;
  cartNumber: number;
  lines: ShopCartLine[];
};

function serializeLines(lines: ShopCartLine[]): unknown[] {
  return serializeCartLinesForDb(lines);
}

function cartTotals(lines: ShopCartLine[]): { lineCount: number; totalAmount: number } {
  return {
    lineCount: lines.length,
    totalAmount: lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0),
  };
}

export async function createShopCart(
  supabase: SupabaseClient,
  visitorKey: string,
  lines: ShopCartLine[],
  fulfillmentMode: ShopFulfillmentMode | null,
  paymentMethod: ShopPaymentMethod | null,
  orderComment: string,
): Promise<{ data: ShopCartSyncResult | null; error: string | null }> {
  let prunedLines: ShopCartLine[];
  try {
    prunedLines = await pruneCartLinesForShopCatalog(supabase, lines);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur catalogue";
    return { data: null, error: msg };
  }
  if (prunedLines.length === 0) {
    return { data: null, error: "Panier vide" };
  }

  const visitDate = todayCasablancaIsoDate();
  const { lineCount, totalAmount } = cartTotals(prunedLines);

  const heartbeat = await recordShopHeartbeat(supabase, visitorKey, lineCount, totalAmount, visitDate);
  if (heartbeat.error) return { data: null, error: heartbeat.error };

  const { data, error } = await supabase
    .from("shop_cart")
    .insert({
      visitor_key: visitorKey,
      lines: serializeLines(prunedLines),
      fulfillment_mode: fulfillmentMode,
      payment_method: paymentMethod,
      order_comment: orderComment.trim() || null,
      status: "active",
    })
    .select("id, cart_number")
    .single();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Panier non créé" };

  return {
    data: {
      cartId: String(data.id),
      cartNumber: Number(data.cart_number),
      lines: prunedLines,
    },
    error: null,
  };
}

export async function updateShopCart(
  supabase: SupabaseClient,
  cartId: string,
  visitorKey: string,
  lines: ShopCartLine[],
  fulfillmentMode: ShopFulfillmentMode | null,
  paymentMethod: ShopPaymentMethod | null,
  orderComment: string,
): Promise<{ data: ShopCartSyncResult | null; error: string | null }> {
  let prunedLines: ShopCartLine[];
  try {
    prunedLines = await pruneCartLinesForShopCatalog(supabase, lines);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur catalogue";
    return { data: null, error: msg };
  }

  const visitDate = todayCasablancaIsoDate();
  const { lineCount, totalAmount } = cartTotals(prunedLines);

  const heartbeat = await recordShopHeartbeat(supabase, visitorKey, lineCount, totalAmount, visitDate);
  if (heartbeat.error) return { data: null, error: heartbeat.error };

  const { data, error } = await supabase
    .from("shop_cart")
    .update({
      lines: serializeLines(prunedLines),
      fulfillment_mode: fulfillmentMode,
      payment_method: paymentMethod,
      order_comment: orderComment.trim() || null,
    })
    .eq("id", cartId)
    .eq("visitor_key", visitorKey)
    .eq("status", "active")
    .select("id, cart_number")
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Panier introuvable" };

  return {
    data: {
      cartId: String(data.id),
      cartNumber: Number(data.cart_number),
      lines: prunedLines,
    },
    error: null,
  };
}

export async function clearShopCart(
  supabase: SupabaseClient,
  cartId: string,
  visitorKey: string,
): Promise<{ error: string | null }> {
  const visitDate = todayCasablancaIsoDate();

  const heartbeat = await recordShopHeartbeat(supabase, visitorKey, 0, 0, visitDate);
  if (heartbeat.error) return { error: heartbeat.error };

  const { error } = await supabase
    .from("shop_cart")
    .update({ status: "cleared", lines: [] })
    .eq("id", cartId)
    .eq("visitor_key", visitorKey)
    .eq("status", "active");

  if (error) return { error: error.message };
  return { error: null };
}

function totalFromStoredLines(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  let sum = 0;
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const l = raw as Record<string, unknown>;
    const qty = typeof l.qty === "number" ? l.qty : 0;
    const price = typeof l.priceAtAdd === "number" ? l.priceAtAdd : 0;
    if (Number.isFinite(qty) && Number.isFinite(price)) {
      sum += qty * price;
    }
  }
  return Math.round(sum * 100) / 100;
}

export async function submitShopCart(
  supabase: SupabaseClient,
  cartId: string,
  visitorKey: string,
): Promise<{ data: ShopCartSyncResult | null; error: string | null }> {
  const { data: existing, error: fe } = await supabase
    .from("shop_cart")
    .select("id, cart_number, lines, status, submitted_at")
    .eq("id", cartId)
    .eq("visitor_key", visitorKey)
    .maybeSingle();

  if (fe) return { data: null, error: fe.message };
  if (!existing) return { data: null, error: "Panier introuvable" };

  const status = String(existing.status);
  if (status === "submitted" && existing.submitted_at != null) {
    return {
      data: {
        cartId: String(existing.id),
        cartNumber: Number(existing.cart_number),
        lines: parseStoredCartLines(existing.lines),
      },
      error: null,
    };
  }

  if (status !== "active") {
    return { data: null, error: "Panier non soumissible" };
  }

  const storedLines = parseStoredCartLines(existing.lines);
  if (storedLines.length === 0) {
    return { data: null, error: "Panier vide" };
  }

  // Commande figée à l'envoi : ne pas retirer les lignes même si le produit n'est plus en vitrine.
  const totalAmount = totalFromStoredLines(storedLines);

  const { data, error } = await supabase
    .from("shop_cart")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      montant_total: totalAmount,
      payment_status: "unpaid",
      workflow_status: "nouvelle",
    })
    .eq("id", cartId)
    .eq("visitor_key", visitorKey)
    .eq("status", "active")
    .select("id, cart_number")
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Soumission impossible" };

  return {
    data: {
      cartId: String(data.id),
      cartNumber: Number(data.cart_number),
      lines: storedLines,
    },
    error: null,
  };
}
