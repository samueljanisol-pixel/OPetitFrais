import { roundMoney, roundMoneyHalf } from "../format/money.js";
import type { AddProductInput, AddProductResult, CartLine, CartState } from "../types.js";

export function createEmptyCart(): CartState {
  return { lines: [], clientId: null, clientName: null };
}

export function cartTotals(cart: CartState): { lineCount: number; total: number } {
  const raw = roundMoney(cart.lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const total = roundMoneyHalf(raw);
  return { lineCount: cart.lines.length, total };
}

function newLineId(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addProductToCart(
  cart: CartState,
  input: AddProductInput,
): AddProductResult {
  const { product, weightKg, printPriceMode, qty: inputQty } = input;

  if (!product.active) {
    return { ok: false, error: "Produit inactif" };
  }

  if (printPriceMode) {
    return { ok: true, action: "print_label" };
  }

  let qty: number;
  if (inputQty !== undefined) {
    qty = roundMoney(inputQty);
    if (!Number.isFinite(qty) || qty === 0) {
      return { ok: false, error: "Quantité invalide" };
    }
  } else if (product.salesUnit === "kg") {
    const w = weightKg ?? 0;
    if (!Number.isFinite(w) || w <= 0) {
      return {
        ok: false,
        error: `Poids requis pour ce produit (balance : ${w.toFixed(3)} kg)`,
      };
    }
    qty = roundMoney(w);
  } else {
    qty = 1;
  }

  if (!Number.isFinite(product.price) || product.price < 0) {
    return { ok: false, error: "Prix produit invalide" };
  }

  const lineTotal = roundMoney(qty * product.price);
  const line: CartLine = {
    id: newLineId(),
    productId: product.id,
    productCode: product.code,
    productName: product.salesName,
    categoryLabel: product.categoryLabel,
    qty,
    unitPrice: product.price,
    lineTotal,
    salesUnit: product.salesUnit,
  };

  return { ok: true, action: "cart", line };
}

/** Fusionne une ligne sur un produit déjà présent (même id + même prix). */
export function mergeLineIntoCart(cart: CartState, line: CartLine): CartState {
  const idx = cart.lines.findIndex(
    (l) => l.productId === line.productId && l.unitPrice === line.unitPrice,
  );
  if (idx < 0) {
    return appendLine(cart, line);
  }

  const existing = cart.lines[idx]!;
  const qty = roundMoney(existing.qty + line.qty);
  const merged: CartLine = {
    ...existing,
    qty,
    lineTotal: roundMoney(qty * existing.unitPrice),
  };
  const lines = cart.lines.slice();
  lines[idx] = merged;
  return { ...cart, lines };
}

export function appendLine(cart: CartState, line: CartLine): CartState {
  return { ...cart, lines: [...cart.lines, line] };
}

export function removeLine(cart: CartState, lineId: string): CartState {
  return { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) };
}

export function updateCartLine(
  cart: CartState,
  lineId: string,
  patch: { qty?: number; unitPrice?: number },
): { cart: CartState; error?: string } {
  const idx = cart.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) return { cart };

  const line = cart.lines[idx]!;
  const qty = patch.qty !== undefined ? roundMoney(patch.qty) : line.qty;
  const unitPrice = patch.unitPrice !== undefined ? roundMoney(patch.unitPrice) : line.unitPrice;

  if (!Number.isFinite(qty) || qty === 0) {
    return { cart, error: "Quantité invalide" };
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { cart, error: "Prix invalide" };
  }

  const updated: CartLine = {
    ...line,
    qty,
    unitPrice,
    lineTotal: roundMoney(qty * unitPrice),
  };
  const lines = cart.lines.slice();
  lines[idx] = updated;
  return { cart: { ...cart, lines } };
}

export function clearCart(cart: CartState): CartState {
  return { lines: [], clientId: null, clientName: null };
}

export function setClient(
  cart: CartState,
  client: { id: string | null; name: string | null },
): CartState {
  return { ...cart, clientId: client.id, clientName: client.name };
}

export function findProductByCode(
  catalog: readonly { code: string }[],
  code: string,
): { code: string } | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^0+/, "") || "0";
  return (
    catalog.find((p) => {
      const pc = p.code.trim();
      const pn = pc.replace(/^0+/, "") || "0";
      return pc === trimmed || pn === normalized || pc === normalized;
    }) ?? null
  );
}
