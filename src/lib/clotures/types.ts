import type { CloturePaymentBreakdown, ClotureSnapshot } from "@opf/caisse-core";

export type { CloturePaymentBreakdown, ClotureSnapshot };

export type CaisseClotureStatus = "a_verifier" | "verifiee";

export type CaisseTicketExport = {
  ticketRef: string;
  ticketNumber: number;
  magasinCode: string;
  caisseCode: string;
  soldAt: string;
  total: number;
  clientId: string | null;
  clientName: string | null;
  isDelivery: boolean;
  clotureRef: string | null;
  caissierId: string | null;
  caissierName: string | null;
  lines: Array<{
    productId: string;
    productCode: string;
    productName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    salesUnit: "kg" | "unit";
  }>;
  payments: Array<{ mode: string; label: string; amount: number }>;
};

export type CaisseClotureExport = {
  clotureRef: string;
  clotureNumber: number;
  magasinCode: string;
  caisseCode: string;
  caissierId: string;
  caissierName: string;
  openedAt: string;
  closedAt: string;
  bills50: number;
  bills20: number;
  coins10: number;
  drawerTotal: number;
  snapshot: ClotureSnapshot;
};

export type ClotureListItem = {
  clotureRef: string;
  clotureNumber: number;
  magasinCode: string;
  caisseCode: string;
  caissierName: string;
  openedAt: string;
  closedAt: string;
  saleTotal: number;
  saleCount: number;
  status: CaisseClotureStatus;
};

export type ClotureDetail = ClotureListItem & {
  caissierId: string;
  bills50: number;
  bills20: number;
  coins10: number;
  drawerTotal: number;
  creditSaleTotal: number;
  averageBasket: number;
  deliveryTotal: number;
  settlementTotal: number;
  creditSettlementTotal: number;
  payments: CloturePaymentBreakdown[];
  verifyBills200: number | null;
  verifyBills100: number | null;
  verifyBills50: number | null;
  verifyBills20: number | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
};

export type ClotureVerifyInput = {
  bills200: number;
  bills100: number;
  bills50: number;
  bills20: number;
};

export function asClotureStatus(value: unknown): CaisseClotureStatus {
  return value === "verifiee" ? "verifiee" : "a_verifier";
}

export function parsePaymentsJson(raw: unknown): CloturePaymentBreakdown[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as Record<string, unknown>;
    const mode = typeof item.mode === "string" ? item.mode : "";
    if (!mode) return [];
    const amount = typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : 0;
    const ticketCount =
      typeof item.ticketCount === "number" && Number.isFinite(item.ticketCount)
        ? Math.max(0, Math.round(item.ticketCount))
        : 0;
    const creditSettlement =
      typeof item.creditSettlement === "number" && Number.isFinite(item.creditSettlement)
        ? item.creditSettlement
        : 0;
    return [
      {
        mode,
        label: typeof item.label === "string" && item.label.trim() ? item.label : mode,
        amount,
        ticketCount,
        creditSettlement,
      },
    ];
  });
}
