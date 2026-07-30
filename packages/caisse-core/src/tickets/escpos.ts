import type { CartLine } from "../types.js";
import { concatBytes } from "../format/bytes.js";
import { formatMoneyFr } from "../format/money.js";
import { escPosCode128BarcodeFullWidth, escPosResetPrintModes } from "./code128.js";
import {
  escPosBlankLine,
  escPosCut,
  escPosFeedLines,
  escPosInit,
  escPosLine,
  escPosLineCenter,
  escPosLineCenterLatin,
  escPosSelectCodePage1252,
  escPosTicketTotalLine,
  sanitizeTicketAscii,
} from "./escpos-commands.js";
import { escPosCenteredRaster } from "./escpos-raster.js";
import {
  OPF_LOGO_HEIGHT,
  OPF_LOGO_RASTER,
  OPF_LOGO_WIDTH,
} from "./logo-opetit-frais-escpos.js";
import {
  formatTicketCategoryRow,
  formatTicketDateTime,
  formatTicketHeaderRow,
  formatTicketLabelValue,
  formatTicketProductRows,
  formatTicketReference,
  formatTicketSeparatorLine,
  formatTicketTotalDh,
  formatTicketTotalLineLabel,
  groupCartLinesByCategory,
  padCenter,
} from "./sale-ticket-format.js";

export type SaleTicketPaymentLine = {
  label: string;
  amount: number;
};

export type SaleTicketInput = {
  magasinCode: string;
  caisseCode: string;
  magasinName?: string | null;
  ticketNumber: number;
  soldAt: Date;
  lines: CartLine[];
  total: number;
  articleCount: number;
  clientName?: string | null;
  payments: SaleTicketPaymentLine[];
  change: number;
  /** Desactiver le logo pre-genere (tests). */
  skipLogo?: boolean;
};

const DEFAULT_STORE_TITLE = "O'PETIT FRAIS";

const DEFAULT_FOOTER_LINES = [
  "MERCI DE VOTRE VISITE",
  "À BIENTÔT",
  "Livraison gratuite à domicile",
  "Téléphone : 05 20 98 89 60",
  "WhatsApp : 07 04 23 22 89",
] as const;

function escPosOpfLogo(): Uint8Array {
  return escPosCenteredRaster(OPF_LOGO_RASTER, OPF_LOGO_WIDTH, OPF_LOGO_HEIGHT);
}

export function buildSaleTicketEscPos(input: SaleTicketInput): Uint8Array {
  const chunks: Uint8Array[] = [escPosInit()];

  if (!input.skipLogo) {
    chunks.push(escPosOpfLogo());
  }
  chunks.push(escPosBlankLine());

  const storeTitle = input.magasinName?.trim() || DEFAULT_STORE_TITLE;
  chunks.push(escPosLine(padCenter(storeTitle)));
  chunks.push(escPosLine(padCenter(`Magasin ${input.magasinCode}  Caisse ${input.caisseCode}`)));
  chunks.push(escPosBlankLine());

  chunks.push(escPosLine(formatTicketHeaderRow()));
  chunks.push(escPosLine(formatTicketSeparatorLine()));

  for (const group of groupCartLinesByCategory(input.lines)) {
    chunks.push(escPosLine(formatTicketCategoryRow(group.category)));
    for (const cartLine of group.lines) {
      for (const row of formatTicketProductRows(cartLine)) {
        chunks.push(escPosLine(row));
      }
    }
  }

  chunks.push(escPosBlankLine());
  chunks.push(escPosLine(formatTicketSeparatorLine()));
  chunks.push(escPosTicketTotalLine(formatTicketTotalLineLabel(input.total)));
  chunks.push(escPosLine(formatTicketLabelValue("Nbr Articles", String(input.articleCount), 16)));

  if (input.clientName?.trim()) {
    chunks.push(
      escPosLine(formatTicketLabelValue("Client", sanitizeTicketAscii(input.clientName.trim()), 16)),
    );
  }

  for (const payment of input.payments) {
    if (payment.amount <= 0) continue;
    chunks.push(
      escPosLine(
        formatTicketLabelValue(
          sanitizeTicketAscii(payment.label),
          formatTicketTotalDh(payment.amount),
          16,
        ),
      ),
    );
  }

  if (input.change > 0.001) {
    chunks.push(escPosLine(formatTicketLabelValue("Rendu", formatTicketTotalDh(input.change), 16)));
  }

  const magasinLabel = sanitizeTicketAscii(input.magasinName?.trim() || input.magasinCode);
  chunks.push(escPosLine(formatTicketLabelValue("Magasin", magasinLabel, 16)));
  chunks.push(escPosLine(formatTicketLabelValue("Caisse", input.caisseCode, 16)));
  chunks.push(escPosLine(formatTicketLabelValue("No Ticket", String(input.ticketNumber), 16)));

  const ticketRef = formatTicketReference(input.magasinCode, input.caisseCode, input.ticketNumber);
  chunks.push(escPosBlankLine());
  chunks.push(escPosResetPrintModes());
  chunks.push(escPosLineCenter(formatTicketDateTime(input.soldAt)));
  chunks.push(escPosCode128BarcodeFullWidth(ticketRef));

  chunks.push(escPosBlankLine());
  chunks.push(escPosSelectCodePage1252());
  for (const footerLine of DEFAULT_FOOTER_LINES) {
    chunks.push(escPosLineCenterLatin(footerLine));
  }

  chunks.push(escPosFeedLines(4), escPosCut());

  return concatBytes(chunks);
}

export type PriceLabelInput = {
  productName: string;
  price: number;
  salesUnit: "kg" | "unit";
};

/** Etiquette prix ~4 cm (80 mm). */
export function buildPriceLabelEscPos(input: PriceLabelInput): Uint8Array {
  const unit = input.salesUnit === "kg" ? "DH/Kg" : "DH/Unite";
  return concatBytes([
    escPosInit(),
    escPosLine(padCenter(sanitizeTicketAscii(input.productName.slice(0, 32)))),
    escPosLine(padCenter(`${formatMoneyFr(input.price)} ${unit}`)),
    escPosCut(),
  ]);
}
