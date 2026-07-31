import { formatMoneyFrFixed } from "../format/money.js";
import { SALE_TICKET_WIDTH } from "./sale-ticket-format.js";

/** Imprimante ticket 80 mm — 203 dpi (Epson). */
export const ESC_POS_DPI = 203;

export const PRICE_LABEL_WIDTH_MM = 80;
export const PRICE_LABEL_HEIGHT_MM = 400;
export const PRICE_LABEL_MARGIN_DOTS = 16;

/** Hauteur d'une ligne double hauteur (Font B, interligne 36 pt). */
export const PRICE_LABEL_DOUBLE_LINE_DOTS = 72;

export function mmToEscPosDots(mm: number, dpi = ESC_POS_DPI): number {
  return Math.round((mm * dpi) / 25.4);
}

export function wrapTicketWords(text: string, maxWidth: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [""];

  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);

    if (word.length <= maxWidth) {
      current = word;
      continue;
    }

    for (let i = 0; i < word.length; i += maxWidth) {
      lines.push(word.slice(i, i + maxWidth));
    }
    current = "";
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/** Partie entière + virgule (gros) et centimes (petits) pour l'étiquette prix. */
export function splitPriceLabelAmount(price: number): { main: string; decimals: string } {
  const formatted = formatMoneyFrFixed(price);
  const commaIdx = formatted.indexOf(",");
  if (commaIdx === -1) {
    return { main: formatted, decimals: "" };
  }
  return {
    main: formatted.slice(0, commaIdx + 1),
    decimals: formatted.slice(commaIdx + 1),
  };
}

export function priceLabelUnitLabel(salesUnit: "kg" | "unit"): string {
  return salesUnit === "kg" ? "Prix au Kg" : "Prix à l'unité";
}

/** Largeur utile nom produit — toute la ligne Font B. */
export const PRICE_LABEL_NAME_WIDTH = SALE_TICKET_WIDTH;
