import {
  concatBytes,
  escPosBlankLine,
  escPosCode128BarcodeFullWidth,
  escPosCut,
  escPosInit,
  escPosLine,
  escPosLineCenter,
  escPosSelectCodePage1252,
} from "@opf/caisse-core";
import type { ShopCartWorkflowLine } from "@/lib/commandes-client/workflow";

export type ShopBoutiquePosSaleLine = {
  productName: string;
  qty: number;
  salesUnit?: string | null;
  comment?: string | null;
};

export type ShopBoutiqueTicketInput = {
  cartNumber: number;
  clientName: string | null;
  fulfillmentMode: string | null;
  paymentStatus: string;
  ticketRef: string;
  lines: ShopCartWorkflowLine[];
  magasinNom?: string | null;
  lineLabels?: Map<string, string>;
  /** Lignes réellement encaissées au POS (prioritaires sur la check-list préparation). */
  posSaleLines?: ShopBoutiquePosSaleLine[];
};

function paymentLabel(paymentStatus: string): string {
  if (paymentStatus === "paid") return "Paye";
  return "Credit client / A encaisser";
}

function fulfillmentLabel(mode: string | null): string {
  if (mode === "pickup") return "Retrait magasin";
  if (mode === "home") return "Livraison";
  return mode ?? "-";
}

function normalizeSalesUnit(salesUnit: string | null | undefined): string {
  return (salesUnit ?? "").trim().toLowerCase();
}

/** Suffixe « x » pour toute unité autre que unité / kg. */
export function salesUnitTicketSuffix(salesUnit: string | null | undefined): string {
  const u = normalizeSalesUnit(salesUnit);
  if (!u || u === "unit" || u === "unité" || u === "unite" || u === "kg") return "";
  return " x";
}

function formatPosSaleLine(line: ShopBoutiquePosSaleLine): string {
  const name = line.productName.trim() || "Article";
  const comment = line.comment?.trim() ? ` (${line.comment.trim()})` : "";
  const suffix = salesUnitTicketSuffix(line.salesUnit);
  return `${line.qty} ${name}${suffix}${comment}`;
}

export function buildShopBoutiqueTicketEscPos(input: ShopBoutiqueTicketInput): Uint8Array {
  const chunks: Uint8Array[] = [];
  chunks.push(escPosInit());
  chunks.push(escPosSelectCodePage1252());
  chunks.push(escPosLineCenter("COMMANDE BOUTIQUE"));
  chunks.push(escPosLineCenter(`#${input.cartNumber}`));
  chunks.push(escPosBlankLine());
  if (input.magasinNom) chunks.push(escPosLine(`Magasin: ${input.magasinNom}`));
  chunks.push(escPosLine(`Client: ${input.clientName ?? "-"}`));
  chunks.push(escPosLine(`Mode: ${fulfillmentLabel(input.fulfillmentMode)}`));
  chunks.push(escPosLine(`Paiement: ${paymentLabel(input.paymentStatus)}`));
  chunks.push(escPosBlankLine());

  const posLines = input.posSaleLines?.filter((l) => l != null && l.productName.trim().length > 0) ?? [];
  if (posLines.length > 0) {
    chunks.push(escPosLine("--- Articles caisse ---"));
    for (const line of posLines) {
      chunks.push(escPosLine(formatPosSaleLine(line)));
    }
  } else {
    chunks.push(escPosLine("--- Check-list ---"));
    for (const line of input.lines) {
      const mark = line.unavailable ? "[!]" : line.prepared ? "[x]" : "[ ]";
      const label =
        input.lineLabels?.get(line.productId) ?? line.unitLabel ?? line.productId.slice(0, 12);
      const comment = line.comment ? ` (${line.comment})` : "";
      const suffix = salesUnitTicketSuffix(line.unitCode ?? line.unitLabel);
      chunks.push(escPosLine(`${mark} ${line.qty} ${label}${suffix}${comment}`));
    }
  }

  chunks.push(escPosBlankLine());
  chunks.push(escPosLineCenter("Ticket caisse:"));
  chunks.push(escPosCode128BarcodeFullWidth(input.ticketRef));
  chunks.push(escPosLineCenter(input.ticketRef));
  chunks.push(escPosBlankLine());
  chunks.push(escPosCut());
  return concatBytes(chunks);
}
