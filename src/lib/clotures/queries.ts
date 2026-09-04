import type { SessionMagasin } from "@/lib/auth/session-types";
import { codesMatch, normalizePosCode } from "@/lib/clotures/normalize-codes";
import {
  asClotureStatus,
  parsePaymentsJson,
  type CaisseClotureStatus,
  type ClotureDetail,
  type ClotureListItem,
} from "@/lib/clotures/types";

type ClotureRow = {
  cloture_ref: string;
  cloture_number: number;
  magasin_code: string;
  caisse_code: string;
  caissier_id: string;
  caissier_name: string;
  opened_at: string;
  closed_at: string;
  bills50: number;
  bills20: number;
  coins10: number;
  drawer_total: number;
  sale_total: number;
  credit_sale_total: number;
  sale_count: number;
  average_basket: number;
  delivery_total: number;
  settlement_total: number;
  credit_settlement_total: number;
  payments: unknown;
  status: string;
  verify_bills200: number | null;
  verify_bills100: number | null;
  verify_bills50: number | null;
  verify_bills20: number | null;
  verified_at: string | null;
  verified_by: string | null;
};

const CLOTURE_SELECT =
  "cloture_ref, cloture_number, magasin_code, caisse_code, caissier_id, caissier_name, opened_at, closed_at, bills50, bills20, coins10, drawer_total, sale_total, credit_sale_total, sale_count, average_basket, delivery_total, settlement_total, credit_settlement_total, payments, status, verify_bills200, verify_bills100, verify_bills50, verify_bills20, verified_at, verified_by";

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function allowedMagasinCodes(magasins: SessionMagasin[], restricted: boolean): string[] | null {
  if (!restricted) return null;
  const codes = magasins.map((m) => normalizePosCode(m.code)).filter((code) => code.length > 0);
  if (!codes.includes("00")) codes.push("00");
  return codes;
}

export function rowVisible(row: { magasin_code: string }, allowed: string[] | null): boolean {
  if (!allowed) return true;
  return allowed.some((code) => codesMatch(code, row.magasin_code));
}

export function mapClotureListItem(row: ClotureRow): ClotureListItem {
  return {
    clotureRef: row.cloture_ref,
    clotureNumber: asNumber(row.cloture_number),
    magasinCode: row.magasin_code,
    caisseCode: row.caisse_code,
    caissierName: row.caissier_name,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    saleTotal: asNumber(row.sale_total),
    saleCount: asNumber(row.sale_count),
    status: asClotureStatus(row.status),
  };
}

export function mapClotureDetail(row: ClotureRow): ClotureDetail {
  return {
    ...mapClotureListItem(row),
    caissierId: row.caissier_id,
    bills50: asNumber(row.bills50),
    bills20: asNumber(row.bills20),
    coins10: asNumber(row.coins10),
    drawerTotal: asNumber(row.drawer_total),
    creditSaleTotal: asNumber(row.credit_sale_total),
    averageBasket: asNumber(row.average_basket),
    deliveryTotal: asNumber(row.delivery_total),
    settlementTotal: asNumber(row.settlement_total),
    creditSettlementTotal: asNumber(row.credit_settlement_total),
    payments: parsePaymentsJson(row.payments),
    verifyBills200: row.verify_bills200 == null ? null : asNumber(row.verify_bills200),
    verifyBills100: row.verify_bills100 == null ? null : asNumber(row.verify_bills100),
    verifyBills50: row.verify_bills50 == null ? null : asNumber(row.verify_bills50),
    verifyBills20: row.verify_bills20 == null ? null : asNumber(row.verify_bills20),
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
  };
}

export { CLOTURE_SELECT };
export type { ClotureRow, CaisseClotureStatus };
