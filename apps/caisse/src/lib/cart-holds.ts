import type { CartState } from "@opf/caisse-core";
import { cartTotals } from "@opf/caisse-core";
import { normalizeCartState } from "./cart-cache";

const HOLDS_VERSION = 2;
const HOLDS_PREFIX = "opf-caisse-holds-v1";

export type HeldCartEntry = {
  id: string;
  cart: CartState;
  heldAt: string;
  linkedShopCartId?: string | null;
  linkedShopCartNumber?: number | null;
};

type CachedHoldsPayload = {
  version: typeof HOLDS_VERSION | 1;
  holds: HeldCartEntry[];
};

function holdsKey(magasinCode: string, caisseCode: string): string {
  return `${HOLDS_PREFIX}:${magasinCode.trim()}:${caisseCode.trim()}`;
}

function normalizeHeldEntry(raw: unknown): HeldCartEntry | null {
  if (raw == null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.heldAt !== "string") return null;
  const cart = normalizeCartState(row.cart);
  if (!cart) return null;
  const linkedShopCartId =
    typeof row.linkedShopCartId === "string" && row.linkedShopCartId.trim().length > 0
      ? row.linkedShopCartId.trim()
      : null;
  const linkedShopCartNumber =
    typeof row.linkedShopCartNumber === "number" && Number.isFinite(row.linkedShopCartNumber)
      ? row.linkedShopCartNumber
      : null;
  return {
    id: row.id,
    cart,
    heldAt: row.heldAt,
    linkedShopCartId,
    linkedShopCartNumber,
  };
}

export function loadHeldCarts(magasinCode: string, caisseCode: string): HeldCartEntry[] {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(holdsKey(magasinCode, caisseCode));
    if (!raw) return [];

    const parsed = JSON.parse(raw) as CachedHoldsPayload;
    if ((parsed.version !== HOLDS_VERSION && parsed.version !== 1) || !Array.isArray(parsed.holds)) {
      return [];
    }

    const holds: HeldCartEntry[] = [];
    for (const entry of parsed.holds) {
      const normalized = normalizeHeldEntry(entry);
      if (!normalized) continue;
      const hasLines = normalized.cart.lines.length > 0;
      const hasLinkedOrder = Boolean(normalized.linkedShopCartId);
      if (hasLines || hasLinkedOrder) {
        holds.push(normalized);
      }
    }
    return holds;
  } catch {
    return [];
  }
}

export function saveHeldCarts(
  magasinCode: string,
  caisseCode: string,
  holds: readonly HeldCartEntry[],
): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  const payload: CachedHoldsPayload = {
    version: HOLDS_VERSION,
    holds: [...holds],
  };

  try {
    window.localStorage.setItem(holdsKey(magasinCode, caisseCode), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function createHoldId(): string {
  return `hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function heldCartLabel(entry: HeldCartEntry, index: number): string {
  if (entry.linkedShopCartNumber != null) return `Commande #${entry.linkedShopCartNumber}`;
  if (entry.cart.clientName?.trim()) return entry.cart.clientName.trim();
  return `Attente ${index + 1}`;
}

export function heldCartSummary(entry: HeldCartEntry): { lineCount: number; total: number } {
  return cartTotals(entry.cart);
}

export function formatHeldAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
