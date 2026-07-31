import type { CartLine } from "../types.js";
import { concatBytes } from "../format/bytes.js";
import { escPosCode128BarcodeFullWidth, escPosResetPrintModes } from "./code128.js";
import {
  escPosBlankLine,
  escPosCut,
  escPosEnterPageMode,
  escPosFeedLines,
  escPosInit,
  escPosLine,
  escPosLineCenter,
  escPosLineCenterLatin,
  escPosPrintPageModeData,
  escPosSelectCodePage1252,
  escPosSetPageArea,
  escPosSetPrintDirection,
  escPosStyledLine,
  escPosStyledLineSegments,
  escPosStyledSegmentsAt,
  escPosStyledTextAt,
  escPosTicketTotalLine,
  sanitizeTicketAscii,
} from "./escpos-commands.js";
import {
  mmToEscPosDots,
  PRICE_LABEL_DOUBLE_LINE_DOTS,
  PRICE_LABEL_HEIGHT_MM,
  PRICE_LABEL_MARGIN_DOTS,
  PRICE_LABEL_NAME_WIDTH,
  PRICE_LABEL_WIDTH_MM,
  priceLabelUnitLabel,
  splitPriceLabelAmount,
  wrapTicketWords,
} from "./price-label-format.js";
import { escPosCenteredRaster, escPosRasterAt } from "./escpos-raster.js";
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
  /** Desactiver le logo pre-genere (tests). */
  skipLogo?: boolean;
};

/** Etiquette prix 80 mm × 40 cm — nom haut, prix gros, logo bas-gauche + unité. */
export function buildPriceLabelEscPos(input: PriceLabelInput): Uint8Array {
  const paperWidthDots = mmToEscPosDots(PRICE_LABEL_WIDTH_MM);
  const labelHeightDots = mmToEscPosDots(PRICE_LABEL_HEIGHT_MM);
  const margin = PRICE_LABEL_MARGIN_DOTS;
  const unitLabel = priceLabelUnitLabel(input.salesUnit);
  const { main: priceMain, decimals: priceDecimals } = splitPriceLabelAmount(input.price);
  const nameLines = wrapTicketWords(input.productName, PRICE_LABEL_NAME_WIDTH);

  const chunks: Uint8Array[] = [
    escPosInit(),
    escPosEnterPageMode(),
    escPosSetPageArea(0, 0, paperWidthDots, labelHeightDots),
    escPosSetPrintDirection(0),
  ];

  let y = margin;

  for (const nameLine of nameLines) {
    chunks.push(
      escPosStyledTextAt(
        margin,
        y,
        nameLine,
        { bold: true, doubleHeight: true },
        { newline: false },
      ),
    );
    y += PRICE_LABEL_DOUBLE_LINE_DOTS;
  }

  y += margin;
  chunks.push(
    escPosStyledSegmentsAt(
      margin,
      y,
      [
        {
          text: priceMain,
          style: { bold: true, doubleWidth: true, doubleHeight: true },
        },
        ...(priceDecimals
          ? [{ text: priceDecimals, style: { bold: true } }]
          : []),
      ],
      { center: true },
      { newline: false },
    ),
  );

  const logoY = labelHeightDots - OPF_LOGO_HEIGHT - margin;
  const unitX = margin + OPF_LOGO_WIDTH + 24;
  const unitY = logoY + Math.max(0, Math.floor((OPF_LOGO_HEIGHT - PRICE_LABEL_DOUBLE_LINE_DOTS) / 2));

  if (!input.skipLogo) {
    chunks.push(
      escPosRasterAt(margin, logoY, OPF_LOGO_RASTER, OPF_LOGO_WIDTH, OPF_LOGO_HEIGHT),
    );
  }

  chunks.push(escPosSelectCodePage1252());
  chunks.push(
    escPosStyledTextAt(
      unitX,
      unitY,
      unitLabel,
      { bold: true, doubleHeight: true },
      { latin: true, newline: false },
    ),
  );

  chunks.push(escPosPrintPageModeData());
  chunks.push(escPosFeedLines(4), escPosCut());

  return concatBytes(chunks);
}
