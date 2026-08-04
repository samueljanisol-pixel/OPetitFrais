import type { CartLine } from "../types.js";
import { formatDecimalFr, formatMoneyFr, roundMoney } from "../format/money.js";

/** Largeur utile ticket 80 mm — Font B ESC/POS ≈ 64 car. */
export const SALE_TICKET_WIDTH = 64;

const COL_NAME = 22;
const COL_QTY = 7;
const COL_UNIT = 9;
const COL_PRICE = 12;
const COL_TOTAL = 12;

function padRight(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text;
  return t + " ".repeat(Math.max(0, width - t.length));
}

function padLeft(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text;
  return " ".repeat(Math.max(0, width - t.length)) + t;
}

export function padCenter(text: string, width = SALE_TICKET_WIDTH): string {
  const t = text.trim();
  if (t.length >= width) return t.slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  return " ".repeat(left) + t + " ".repeat(width - t.length - left);
}

/** Montants colonnes ticket — virgule décimale (modèle WinDev). */
export function formatTicketAmount(value: number, maxDecimals = 2): string {
  return formatDecimalFr(roundMoney(value), maxDecimals);
}

export function formatTicketQty(line: CartLine): string {
  if (line.salesUnit === "kg") {
    const abs = Math.abs(line.qty);
    const decimals = abs >= 10 ? 2 : 3;
    return formatTicketAmount(abs, decimals);
  }
  return formatTicketAmount(Math.abs(line.qty), 3);
}

export function formatTicketUnit(line: CartLine): string {
  return line.salesUnit === "kg" ? "kg" : "Unité";
}

export function formatTicketHeaderRow(): string {
  return (
    padRight("Produit", COL_NAME) +
    padLeft("Qte", COL_QTY) +
    padLeft("Unité", COL_UNIT) +
    padLeft("Prix", COL_PRICE) +
    padLeft("Total", COL_TOTAL)
  );
}

export function formatTicketSeparatorLine(): string {
  return "-".repeat(SALE_TICKET_WIDTH);
}

function formatTicketAmountsSuffix(line: CartLine): string {
  return (
    padLeft(formatTicketQty(line), COL_QTY) +
    padLeft(formatTicketUnit(line), COL_UNIT) +
    padLeft(formatTicketAmount(line.unitPrice), COL_PRICE) +
    padLeft(formatTicketAmount(line.lineTotal), COL_TOTAL)
  );
}

/** Une ou plusieurs lignes si le nom produit dépasse la colonne. */
export function formatTicketProductRows(line: CartLine): string[] {
  const name = line.productName.toUpperCase();
  const suffix = formatTicketAmountsSuffix(line);

  if (name.length <= COL_NAME) {
    return [padRight(name, COL_NAME) + suffix];
  }

  const rows: string[] = [padRight(name.slice(0, COL_NAME), COL_NAME) + suffix];
  let rest = name.slice(COL_NAME).trim();
  while (rest.length > 0) {
    rows.push(padRight(rest.slice(0, COL_NAME), COL_NAME));
    rest = rest.slice(COL_NAME).trim();
  }
  return rows;
}

/** @deprecated Préférer formatTicketProductRows */
export function formatTicketProductRow(line: CartLine): string {
  return formatTicketProductRows(line)[0] ?? "";
}

export function formatTicketCategoryRow(categoryLabel: string): string {
  return padCenter(`--- ${categoryLabel} ---`);
}

export function formatTicketLabelValue(label: string, value: string, labelWidth = 16): string {
  return `${padRight(label, labelWidth)}: ${value}`;
}

export function formatTicketDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatTicketReference(
  magasinCode: string,
  caisseCode: string,
  ticketNumber: number,
): string {
  const m = magasinCode.replace(/\D/g, "").padStart(2, "0").slice(-2);
  const c = caisseCode.replace(/\D/g, "").padStart(2, "0").slice(-2);
  return `M${m}C${c}T${ticketNumber}`;
}

export function groupCartLinesByCategory(lines: CartLine[]): Array<{ category: string; lines: CartLine[] }> {
  const groups: Array<{ category: string; lines: CartLine[] }> = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.category === line.categoryLabel) {
      last.lines.push(line);
      continue;
    }
    groups.push({ category: line.categoryLabel, lines: [line] });
  }
  return groups;
}

/** Total ticket affiché « 86,50 DH » dans le pied. */
export function formatTicketTotalDh(value: number): string {
  return `${formatMoneyFr(value)} DH`;
}

/** Libelle complet TOTAL pour la ligne mise en avant (gras, droite). */
export function formatTicketTotalLineLabel(total: number): string {
  return `TOTAL: ${formatTicketTotalDh(total)}`;
}
