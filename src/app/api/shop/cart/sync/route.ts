import { NextResponse } from "next/server";
import { isValidVisitorKey } from "@/lib/shop/analytics-client";
import {
  clearShopCart,
  createShopCart,
  submitShopCart,
  updateShopCart,
} from "@/lib/shop/cart-sync-server";
import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";
import type { ShopPaymentMethod } from "@/lib/shop/payment-types";
import type { ShopCartLine } from "@/lib/shop/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SyncBody = {
  action?: unknown;
  visitorKey?: unknown;
  cartId?: unknown;
  lines?: unknown;
  fulfillmentMode?: unknown;
  paymentMethod?: unknown;
  orderComment?: unknown;
};

function parseFulfillmentMode(value: unknown): ShopFulfillmentMode | null {
  if (value === "pickup" || value === "home") return value;
  return null;
}

function parsePaymentMethod(value: unknown): ShopPaymentMethod | null {
  if (value === "cash" || value === "card") return value;
  return null;
}

function parseLine(raw: unknown): ShopCartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.productId !== "string") return null;
  if (typeof l.qty !== "number" || !Number.isFinite(l.qty)) return null;
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

function parseLines(raw: unknown): ShopCartLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseLine).filter((l): l is ShopCartLine => l != null).slice(0, 500);
}

export async function POST(request: Request) {
  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "create" && action !== "sync" && action !== "clear" && action !== "submit") {
    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  }

  if (typeof body.visitorKey !== "string" || !isValidVisitorKey(body.visitorKey)) {
    return NextResponse.json({ error: "visitorKey invalide" }, { status: 400 });
  }

  const visitorKey = body.visitorKey;
  const supabase = createSupabaseServiceRoleClient();

  if (action === "clear") {
    if (typeof body.cartId !== "string" || body.cartId.length === 0) {
      return NextResponse.json({ error: "cartId requis" }, { status: 400 });
    }
    const { error } = await clearShopCart(supabase, body.cartId, visitorKey);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "submit") {
    if (typeof body.cartId !== "string" || body.cartId.length === 0) {
      return NextResponse.json({ error: "cartId requis" }, { status: 400 });
    }
    const { data, error } = await submitShopCart(supabase, body.cartId, visitorKey);
    if (error || !data) return NextResponse.json({ error: error ?? "Erreur" }, { status: 500 });
    return NextResponse.json(data);
  }

  const lines = parseLines(body.lines);
  const fulfillmentMode = parseFulfillmentMode(body.fulfillmentMode);
  const paymentMethod = parsePaymentMethod(body.paymentMethod);
  const orderComment = typeof body.orderComment === "string" ? body.orderComment : "";

  if (action === "create") {
    if (lines.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }
    const { data, error } = await createShopCart(
      supabase,
      visitorKey,
      lines,
      fulfillmentMode,
      paymentMethod,
      orderComment,
    );
    if (error || !data) return NextResponse.json({ error: error ?? "Erreur" }, { status: 500 });
    return NextResponse.json(data);
  }

  if (typeof body.cartId !== "string" || body.cartId.length === 0) {
    return NextResponse.json({ error: "cartId requis" }, { status: 400 });
  }

  const { data, error } = await updateShopCart(
    supabase,
    body.cartId,
    visitorKey,
    lines,
    fulfillmentMode,
    paymentMethod,
    orderComment,
  );
  if (error || !data) return NextResponse.json({ error: error ?? "Erreur" }, { status: 500 });
  return NextResponse.json(data);
}
