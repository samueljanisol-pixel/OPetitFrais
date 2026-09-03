import { roundMoney } from "./format/money.js";

export type VentesJsonLine = {
  article: string;
  qte: number;
  total: number;
};

export type VentesTicketLine = {
  productId: string;
  productCode: string;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  salesUnit: "kg" | "unit";
};

export type VentesTicketPayment = {
  mode: string;
  label: string;
  amount: number;
};

export type VentesTicket = {
  ticketNumber: number;
  ticketRef: string;
  soldAt: string;
  total: number;
  clientId: string | null;
  clientName: string | null;
  isDelivery: boolean;
  lines: VentesTicketLine[];
  payments: VentesTicketPayment[];
  clotureRef?: string | null;
  caissierId?: string | null;
  caissierName?: string | null;
};

export type VentesDayFile = {
  total_jour: number;
  nb_paniers: number;
  panier_moyen: number;
  panier_heure: number[];
  ventes: Record<string, VentesJsonLine>;
  tickets: VentesTicket[];
};

export type VentesMonthFile = {
  total_mois: number;
  nb_paniers: number;
  panier_moyen: number;
  ventes: Record<string, VentesJsonLine>;
};

export type VentesSaleInput = {
  soldAt: string;
  ticketNumber: number;
  ticketRef: string;
  total: number;
  clientId: string | null;
  clientName: string | null;
  isDelivery: boolean;
  lines: VentesTicketLine[];
  payments: VentesTicketPayment[];
  clotureRef?: string | null;
  caissierId?: string | null;
  caissierName?: string | null;
};

const HOUR_SLOTS = 24;

function emptyHourBuckets(): number[] {
  return new Array(HOUR_SLOTS).fill(0);
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function ventesProductKey(line: Pick<VentesTicketLine, "productCode" | "productId" | "productName">): string {
  const code = line.productCode.trim();
  if (code) return code;
  const id = line.productId.trim();
  if (id) return `commande-${id}`;
  const name = line.productName.trim();
  return name || "inconnu";
}

export function localDateKeys(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  const valid = Number.isFinite(d.getTime()) ? d : new Date();
  const y = valid.getFullYear();
  const m = String(valid.getMonth() + 1).padStart(2, "0");
  const day = String(valid.getDate()).padStart(2, "0");
  return { day: `${y}-${m}-${day}`, month: `${y}-${m}` };
}

export function soldAtHour(iso: string): number {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 0;
  const hour = d.getHours();
  if (hour < 0 || hour >= HOUR_SLOTS) return 0;
  return hour;
}

export function emptyDayFile(): VentesDayFile {
  return {
    total_jour: 0,
    nb_paniers: 0,
    panier_moyen: 0,
    panier_heure: emptyHourBuckets(),
    ventes: {},
    tickets: [],
  };
}

export function emptyMonthFile(): VentesMonthFile {
  return {
    total_mois: 0,
    nb_paniers: 0,
    panier_moyen: 0,
    ventes: {},
  };
}

function normalizeHourBuckets(raw: unknown): number[] {
  const out = emptyHourBuckets();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < Math.min(HOUR_SLOTS, raw.length); i++) {
    const n = asFiniteNumber(raw[i]);
    out[i] = n != null && n >= 0 ? Math.round(n) : 0;
  }
  return out;
}

function parseVentesMap(raw: unknown): Record<string, VentesJsonLine> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, VentesJsonLine> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const article = asString(row.article).trim();
    const qte = asFiniteNumber(row.qte) ?? 0;
    const total = asFiniteNumber(row.total) ?? 0;
    const name = article || key.trim();
    if (!name) continue;
    out[key] = { article: name, qte, total };
  }
  return out;
}

function parseTicketLine(raw: unknown): VentesTicketLine | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const salesUnit = row.salesUnit === "kg" ? "kg" : "unit";
  return {
    productId: asString(row.productId),
    productCode: asString(row.productCode),
    productName: asString(row.productName),
    qty: asFiniteNumber(row.qty) ?? 0,
    unitPrice: asFiniteNumber(row.unitPrice) ?? 0,
    lineTotal: asFiniteNumber(row.lineTotal) ?? 0,
    salesUnit,
  };
}

function parseTicketPayment(raw: unknown): VentesTicketPayment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    mode: asString(row.mode),
    label: asString(row.label),
    amount: asFiniteNumber(row.amount) ?? 0,
  };
}

function parseTicket(raw: unknown): VentesTicket | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const ticketRef = asString(row.ticketRef).trim();
  if (!ticketRef) return null;
  const linesRaw = Array.isArray(row.lines) ? row.lines : [];
  const paymentsRaw = Array.isArray(row.payments) ? row.payments : [];
  return {
    ticketNumber: asFiniteNumber(row.ticketNumber) ?? 0,
    ticketRef,
    soldAt: asString(row.soldAt),
    total: asFiniteNumber(row.total) ?? 0,
    clientId: typeof row.clientId === "string" ? row.clientId : null,
    clientName: typeof row.clientName === "string" ? row.clientName : null,
    isDelivery: row.isDelivery === true,
    clotureRef: typeof row.clotureRef === "string" && row.clotureRef.trim() ? row.clotureRef : null,
    caissierId: typeof row.caissierId === "string" && row.caissierId.trim() ? row.caissierId : null,
    caissierName: typeof row.caissierName === "string" && row.caissierName.trim() ? row.caissierName : null,
    lines: linesRaw.flatMap((line) => {
      const parsed = parseTicketLine(line);
      return parsed ? [parsed] : [];
    }),
    payments: paymentsRaw.flatMap((payment) => {
      const parsed = parseTicketPayment(payment);
      return parsed ? [parsed] : [];
    }),
  };
}

export function parseDayFile(raw: unknown): VentesDayFile {
  const base = emptyDayFile();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  const ticketsRaw = Array.isArray(row.tickets) ? row.tickets : [];
  return {
    total_jour: asFiniteNumber(row.total_jour) ?? 0,
    nb_paniers: asFiniteNumber(row.nb_paniers) ?? 0,
    panier_moyen: asFiniteNumber(row.panier_moyen) ?? 0,
    panier_heure: normalizeHourBuckets(row.panier_heure),
    ventes: parseVentesMap(row.ventes),
    tickets: ticketsRaw.flatMap((ticket) => {
      const parsed = parseTicket(ticket);
      return parsed ? [parsed] : [];
    }),
  };
}

export function parseMonthFile(raw: unknown): VentesMonthFile {
  const base = emptyMonthFile();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  return {
    total_mois: asFiniteNumber(row.total_mois) ?? 0,
    nb_paniers: asFiniteNumber(row.nb_paniers) ?? 0,
    panier_moyen: asFiniteNumber(row.panier_moyen) ?? 0,
    ventes: parseVentesMap(row.ventes),
  };
}

function addProductLine(
  ventes: Record<string, VentesJsonLine>,
  line: VentesTicketLine,
): Record<string, VentesJsonLine> {
  const key = ventesProductKey(line);
  const prev = ventes[key];
  const article = line.productName.trim() || prev?.article || key;
  return {
    ...ventes,
    [key]: {
      article,
      qte: roundQty((prev?.qte ?? 0) + line.qty),
      total: roundMoney((prev?.total ?? 0) + line.lineTotal),
    },
  };
}

function withPanierMoyen(total: number, nbPaniers: number): number {
  if (nbPaniers <= 0) return 0;
  return roundMoney(total / nbPaniers);
}

export function mergeSaleIntoDayFile(existing: VentesDayFile, sale: VentesSaleInput): VentesDayFile {
  if (existing.tickets.some((ticket) => ticket.ticketRef === sale.ticketRef)) {
    return existing;
  }

  let ventes = existing.ventes;
  for (const line of sale.lines) {
    ventes = addProductLine(ventes, line);
  }

  const hour = soldAtHour(sale.soldAt);
  const panier_heure = [...existing.panier_heure];
  panier_heure[hour] = (panier_heure[hour] ?? 0) + 1;

  const total_jour = roundMoney(existing.total_jour + sale.total);
  const nb_paniers = existing.nb_paniers + 1;

  return {
    total_jour,
    nb_paniers,
    panier_moyen: withPanierMoyen(total_jour, nb_paniers),
    panier_heure,
    ventes,
    tickets: [
      ...existing.tickets,
      {
        ticketNumber: sale.ticketNumber,
        ticketRef: sale.ticketRef,
        soldAt: sale.soldAt,
        total: roundMoney(sale.total),
        clientId: sale.clientId,
        clientName: sale.clientName,
        isDelivery: sale.isDelivery,
        clotureRef: sale.clotureRef ?? null,
        caissierId: sale.caissierId ?? null,
        caissierName: sale.caissierName ?? null,
        lines: sale.lines,
        payments: sale.payments,
      },
    ],
  };
}

export function mergeSaleIntoMonthFile(existing: VentesMonthFile, sale: VentesSaleInput): VentesMonthFile {
  let ventes = existing.ventes;
  for (const line of sale.lines) {
    ventes = addProductLine(ventes, line);
  }

  const total_mois = roundMoney(existing.total_mois + sale.total);
  const nb_paniers = existing.nb_paniers + 1;

  return {
    total_mois,
    nb_paniers,
    panier_moyen: withPanierMoyen(total_mois, nb_paniers),
    ventes,
  };
}
