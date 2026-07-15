import { SHOP_VISITOR_STORAGE_KEY } from "@/lib/shop/analytics-constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidVisitorKey(value: string): boolean {
  return UUID_RE.test(value);
}

export function getOrCreateShopVisitorKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SHOP_VISITOR_STORAGE_KEY);
    if (existing && isValidVisitorKey(existing)) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(SHOP_VISITOR_STORAGE_KEY, next);
    return next;
  } catch {
    return "";
  }
}

export type ShopHeartbeatPayload = {
  visitorKey: string;
  lineCount: number;
  totalAmount: number;
};

export async function sendShopHeartbeat(payload: ShopHeartbeatPayload): Promise<void> {
  if (!isValidVisitorKey(payload.visitorKey)) return;
  await fetch("/api/shop/analytics/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}
