import { roundMoney } from "./format/money.js";
import type { VentesTicket } from "./ventes-json.js";

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  credit: "Crédit",
  check: "Chèque",
  transfer: "Virement",
};

const PAYMENT_MODE_ORDER = ["cash", "card", "check", "transfer", "credit"];

export type CloturePaymentBreakdown = {
  mode: string;
  label: string;
  amount: number;
  ticketCount: number;
  creditSettlement: number;
};

export type ClotureSnapshot = {
  saleTotal: number;
  creditSaleTotal: number;
  saleCount: number;
  averageBasket: number;
  deliveryTotal: number;
  settlementTotal: number;
  creditSettlementTotal: number;
  payments: CloturePaymentBreakdown[];
};

export function paymentModeLabel(mode: string, fallback = ""): string {
  return PAYMENT_MODE_LABELS[mode] ?? (fallback.trim() || mode);
}

export function emptyClotureSnapshot(): ClotureSnapshot {
  return {
    saleTotal: 0,
    creditSaleTotal: 0,
    saleCount: 0,
    averageBasket: 0,
    deliveryTotal: 0,
    settlementTotal: 0,
    creditSettlementTotal: 0,
    payments: [],
  };
}

export function computeClotureSnapshot(tickets: VentesTicket[]): ClotureSnapshot {
  const saleCount = tickets.length;
  let saleTotal = 0;
  let deliveryTotal = 0;
  let creditSaleTotal = 0;
  const byMode = new Map<string, { amount: number; label: string; ticketRefs: Set<string> }>();

  for (const ticket of tickets) {
    saleTotal += ticket.total;
    if (ticket.isDelivery) deliveryTotal += ticket.total;
    for (const payment of ticket.payments) {
      const mode = typeof payment.mode === "string" ? payment.mode.trim() : "";
      if (!mode) continue;
      const amount = typeof payment.amount === "number" && Number.isFinite(payment.amount) ? payment.amount : 0;
      if (mode === "credit") creditSaleTotal += amount;
      const existing = byMode.get(mode);
      if (existing) {
        existing.amount += amount;
        existing.ticketRefs.add(ticket.ticketRef);
        continue;
      }
      byMode.set(mode, {
        amount,
        label: paymentModeLabel(mode, payment.label),
        ticketRefs: new Set([ticket.ticketRef]),
      });
    }
  }

  const settlementTotal = [...byMode.entries()]
    .filter(([mode]) => mode !== "credit")
    .reduce((sum, [, row]) => sum + row.amount, 0);

  const payments = [...byMode.entries()]
    .map(([mode, row]) => ({
      mode,
      label: row.label,
      amount: roundMoney(row.amount),
      ticketCount: row.ticketRefs.size,
      creditSettlement: 0,
    }))
    .sort((a, b) => {
      const ia = PAYMENT_MODE_ORDER.indexOf(a.mode);
      const ib = PAYMENT_MODE_ORDER.indexOf(b.mode);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  return {
    saleTotal: roundMoney(saleTotal),
    creditSaleTotal: roundMoney(creditSaleTotal),
    saleCount,
    averageBasket: saleCount > 0 ? roundMoney(saleTotal / saleCount) : 0,
    deliveryTotal: roundMoney(deliveryTotal),
    settlementTotal: roundMoney(settlementTotal),
    creditSettlementTotal: 0,
    payments,
  };
}

export function cashSaleTotal(snapshot: ClotureSnapshot): number {
  return snapshot.payments.find((row) => row.mode === "cash")?.amount ?? 0;
}
