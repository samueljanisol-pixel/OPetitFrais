import path from "path";
import PDFDocument from "pdfkit";
import {
  formatQty,
  type CommandeTicketLine,
  type CommandeTicketPayload,
  type CommandeTicketSupplierBlock,
} from "@/lib/caisse/commande-ticket-data";
import { ticketUiLabels, type TicketLang } from "@/lib/caisse/ticket-lang";

const MM_TO_PT = 72 / 25.4;

/** Page A4 — format qui s’imprime correctement (comme ticket.pdf). */
export const TICKET_PAGE_WIDTH_MM = 210;
export const TICKET_PAGE_HEIGHT_MM = 297;
export const TICKET_PAGE_WIDTH_PT = TICKET_PAGE_WIDTH_MM * MM_TO_PT;
export const TICKET_PAGE_HEIGHT_PT = TICKET_PAGE_HEIGHT_MM * MM_TO_PT;

export const TICKET_CONTENT_WIDTH_MM = 80;
export const TICKET_CONTENT_WIDTH_PT = TICKET_CONTENT_WIDTH_MM * MM_TO_PT;

export const TICKET_WIDTH_MM = TICKET_PAGE_WIDTH_MM;
export const TICKET_WIDTH_PT = TICKET_PAGE_WIDTH_PT;

const INNER_MARGIN_X = 4;
const MARGIN_Y = 14;
const CONTENT_LEFT =
  (TICKET_PAGE_WIDTH_PT - TICKET_CONTENT_WIDTH_PT) / 2 + INNER_MARGIN_X;
const CONTENT_W = TICKET_CONTENT_WIDTH_PT - INNER_MARGIN_X * 2;
const CONTENT_RIGHT = CONTENT_LEFT + CONTENT_W;
const PAGE_MARGIN_LEFT = CONTENT_LEFT;
const PAGE_MARGIN_RIGHT = TICKET_PAGE_WIDTH_PT - CONTENT_RIGHT;

/** Hauteur utile pour le contenu sur une page A4. */
const PAGE_CONTENT_HEIGHT =
  TICKET_PAGE_HEIGHT_PT - MARGIN_Y * 2;

const COL_QTY = 28;
const COL_UNIT = 58;
const COL_GAP = 2;

const FONT_REG = "TicketRegular";
const FONT_BOLD = "TicketBold";

type TicketLangLabels = ReturnType<typeof ticketUiLabels>;

type Block =
  | { kind: "magasin_header" }
  | {
      kind: "supplier_banner";
      supplier: CommandeTicketSupplierBlock;
      suite: boolean;
    }
  | { kind: "category"; label: string }
  | { kind: "table_header" }
  | { kind: "product"; line: CommandeTicketLine }
  | { kind: "empty_supplier" }
  | { kind: "footer" };

function formatDateFr(dateIso: string): string {
  if (!dateIso) return "—";
  const [y, m, d] = dateIso.split("-");
  if (!y || !m || !d) return dateIso;
  return `${d}/${m}/${y}`;
}

function arabicFontPaths(): { regular: string; bold: string } {
  const base = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans-arabic",
    "files",
  );
  return {
    regular: path.join(base, "noto-sans-arabic-arabic-400-normal.woff"),
    bold: path.join(base, "noto-sans-arabic-arabic-700-normal.woff"),
  };
}

function registerFonts(doc: PDFKit.PDFDocument, lang: TicketLang): void {
  if (lang !== "ar") return;
  const fonts = arabicFontPaths();
  doc.registerFont(FONT_REG, fonts.regular);
  doc.registerFont(FONT_BOLD, fonts.bold);
}

function fontRegular(lang: TicketLang): string {
  return lang === "ar" ? FONT_REG : "Helvetica";
}

function fontBold(lang: TicketLang): string {
  return lang === "ar" ? FONT_BOLD : "Helvetica-Bold";
}

function blockHeight(block: Block): number {
  switch (block.kind) {
    case "magasin_header":
      return 58;
    case "supplier_banner":
      return block.suite ? 32 : 48;
    case "category":
      return 16;
    case "table_header":
      return 16;
    case "product": {
      const lines = block.line.packagingLabel ? 2 : 1;
      return 10 + lines * 10 + 8;
    }
    case "empty_supplier":
      return 20;
    case "footer":
      return 28;
    default:
      return 12;
  }
}

/** Découpe le flux en pages A4 (chaque page recommence par le bandeau fournisseur si besoin). */
function buildPages(payload: CommandeTicketPayload): Block[][] {
  const pages: Block[][] = [];
  let current: Block[] = [];
  let used = 0;
  let activeSupplier: CommandeTicketSupplierBlock | null = null;

  const pushPage = () => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    used = 0;
  };

  const addBlock = (block: Block) => {
    const h = blockHeight(block);
    if (used + h > PAGE_CONTENT_HEIGHT && current.length > 0) {
      pushPage();
      // Nouvelle page en cours de fournisseur → bandeau « suite »
      if (
        activeSupplier &&
        block.kind !== "supplier_banner" &&
        block.kind !== "magasin_header"
      ) {
        const suiteBanner: Block = {
          kind: "supplier_banner",
          supplier: activeSupplier,
          suite: true,
        };
        current.push(suiteBanner);
        used += blockHeight(suiteBanner);
      }
    }
    current.push(block);
    used += h;
  };

  addBlock({ kind: "magasin_header" });

  if (payload.suppliers.length === 0) {
    addBlock({ kind: "footer" });
    pushPage();
    return pages;
  }

  for (const supplier of payload.suppliers) {
    activeSupplier = supplier;
    addBlock({ kind: "supplier_banner", supplier, suite: false });

    if (supplier.groups.length === 0) {
      addBlock({ kind: "empty_supplier" });
      continue;
    }

    for (const group of supplier.groups) {
      addBlock({ kind: "category", label: group.categoryLabel });
      addBlock({ kind: "table_header" });
      for (const line of group.lines) {
        addBlock({ kind: "product", line });
      }
    }
  }

  addBlock({ kind: "footer" });
  pushPage();
  return pages;
}

export function countTicketPdfPages(payload: CommandeTicketPayload): number {
  return buildPages(payload).length;
}

function drawDottedSeparator(doc: PDFKit.PDFDocument): void {
  const y = doc.y + 1;
  doc.save();
  doc.lineWidth(0.6);
  doc.dash(1.5, { space: 1.5 });
  doc.moveTo(CONTENT_LEFT, y).lineTo(CONTENT_RIGHT, y).stroke();
  doc.undash();
  doc.restore();
  doc.y = y + 3;
}

function drawTableHeader(doc: PDFKit.PDFDocument, lang: TicketLang, labels: TicketLangLabels): void {
  const y = doc.y;
  const productW = CONTENT_W - COL_QTY - COL_UNIT - COL_GAP * 2;
  const qtyX = CONTENT_LEFT + productW + COL_GAP;
  const unitX = qtyX + COL_QTY + COL_GAP;
  const alignEnd = lang === "ar" ? "right" : "left";

  doc.font(fontBold(lang)).fontSize(7);
  doc.text(labels.productCol, CONTENT_LEFT, y, {
    width: productW,
    align: alignEnd,
    lineBreak: false,
  });
  doc.text(labels.qtyCol, qtyX, y, { width: COL_QTY, align: "right", lineBreak: false });
  doc.text(labels.unitCol, unitX, y, { width: COL_UNIT, align: "left", lineBreak: false });
  doc.y = y + 11;
  doc.moveTo(CONTENT_LEFT, doc.y).lineTo(CONTENT_RIGHT, doc.y).stroke();
  doc.moveDown(0.12);
}

function drawProduct(
  doc: PDFKit.PDFDocument,
  line: CommandeTicketLine,
  lang: TicketLang,
): void {
  const productW = CONTENT_W - COL_QTY - COL_UNIT - COL_GAP * 2;
  const qtyX = CONTENT_LEFT + productW + COL_GAP;
  const unitX = qtyX + COL_QTY + COL_GAP;
  const alignEnd = lang === "ar" ? "right" : "left";
  const nameBlock = line.packagingLabel
    ? `${line.productName}\n${line.packagingLabel}`
    : line.productName;

  const rowY = doc.y;
  doc.font(fontBold(lang)).fontSize(8).text(nameBlock, CONTENT_LEFT, rowY, {
    width: productW,
    align: alignEnd,
  });
  const afterNameY = doc.y;
  doc.font(fontRegular(lang)).fontSize(8).text(formatQty(line.qty), qtyX, rowY, {
    width: COL_QTY,
    align: "right",
    lineBreak: false,
  });
  doc.font(fontRegular(lang)).fontSize(7).text(line.unitLabel, unitX, rowY, {
    width: COL_UNIT,
    align: "left",
  });
  doc.y = Math.max(afterNameY, rowY + 10) + 1;
  drawDottedSeparator(doc);
}

function drawBlock(
  doc: PDFKit.PDFDocument,
  block: Block,
  payload: CommandeTicketPayload,
  lang: TicketLang,
  labels: TicketLangLabels,
): void {
  switch (block.kind) {
    case "magasin_header": {
      const magasinTitle =
        payload.magasin.nom?.trim() || payload.magasin.code || "Magasin";
      doc.font("Helvetica-Bold").fontSize(11).text(magasinTitle, CONTENT_LEFT, doc.y, {
        width: CONTENT_W,
        align: "center",
      });
      doc.font("Helvetica").fontSize(8).text(payload.magasin.code, CONTENT_LEFT, doc.y, {
        width: CONTENT_W,
        align: "center",
      });
      doc.moveDown(0.2);
      doc.font(fontBold(lang)).fontSize(9).text(labels.title, CONTENT_LEFT, doc.y, {
        width: CONTENT_W,
        align: "center",
      });
      doc.moveDown(0.25);
      doc.moveTo(CONTENT_LEFT, doc.y).lineTo(CONTENT_RIGHT, doc.y).stroke();
      doc.moveDown(0.25);
      break;
    }
    case "supplier_banner": {
      const barH = 20;
      const barY = doc.y;
      const title = block.suite
        ? `${block.supplier.supplierLabel} (suite)`
        : block.supplier.supplierLabel;
      doc.save();
      doc.rect(CONTENT_LEFT, barY, CONTENT_W, barH).fill("#222222");
      doc.fillColor("#FFFFFF");
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text(title, CONTENT_LEFT + 2, barY + 4, {
        width: CONTENT_W - 4,
        align: "center",
        lineBreak: false,
      });
      doc.restore();
      doc.fillColor("#000000");
      doc.y = barY + barH + 3;
      if (!block.suite) {
        doc.font(fontRegular(lang)).fontSize(7).text(
          `${labels.datePrefix} : ${formatDateFr(block.supplier.dateIso)}`,
          CONTENT_LEFT,
          doc.y,
          { width: CONTENT_W, align: "center" },
        );
      }
      doc.moveTo(CONTENT_LEFT, doc.y).lineTo(CONTENT_RIGHT, doc.y).stroke();
      doc.moveDown(0.2);
      break;
    }
    case "category":
      doc.font(fontBold(lang)).fontSize(9).text(block.label.toUpperCase(), CONTENT_LEFT, doc.y, {
        width: CONTENT_W,
        align: "center",
      });
      break;
    case "table_header":
      drawTableHeader(doc, lang, labels);
      break;
    case "product":
      drawProduct(doc, block.line, lang);
      break;
    case "empty_supplier":
      doc.font(fontRegular(lang)).fontSize(8).text(labels.noLines, CONTENT_LEFT, doc.y, {
        width: CONTENT_W,
        align: "center",
      });
      doc.moveDown(0.3);
      break;
    case "footer":
      doc.moveTo(CONTENT_LEFT, doc.y).lineTo(CONTENT_RIGHT, doc.y).stroke();
      doc.moveDown(0.2);
      doc.font(fontRegular(lang)).fontSize(7).text(
        labels.footer(payload.suppliers.length, payload.lineCount),
        CONTENT_LEFT,
        doc.y,
        { width: CONTENT_W, align: "center" },
      );
      break;
  }
}

function a4Options() {
  return {
    size: [TICKET_PAGE_WIDTH_PT, TICKET_PAGE_HEIGHT_PT] as [number, number],
    margins: {
      top: MARGIN_Y,
      bottom: MARGIN_Y,
      left: PAGE_MARGIN_LEFT,
      right: PAGE_MARGIN_RIGHT,
    },
  };
}

export type BuildTicketPdfOptions = {
  /** Page 1-based. Si défini, renvoie un PDF d’**une seule** page A4. */
  page?: number;
};

/**
 * PDF A4 (210×297), contenu ~80 mm centré.
 * Sans `page` : toutes les pages. Avec `page` : une seule page (idéal WinDev).
 */
export async function buildCommandeTicketPdf(
  payload: CommandeTicketPayload,
  options: BuildTicketPdfOptions = {},
): Promise<Buffer> {
  const lang = payload.lang ?? "fr";
  const labels = ticketUiLabels(lang);
  const pages = buildPages(payload);

  if (pages.length === 0) {
    throw new Error("Aucune page à générer.");
  }

  const pageOpt = options.page;
  let pagesToRender: Block[][];
  if (pageOpt != null) {
    if (!Number.isInteger(pageOpt) || pageOpt < 1 || pageOpt > pages.length) {
      const err = new Error(`Page invalide (1…${pages.length}).`) as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }
    const only = pages[pageOpt - 1];
    if (!only) {
      const err = new Error(`Page invalide (1…${pages.length}).`) as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }
    pagesToRender = [only];
  } else {
    pagesToRender = pages;
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...a4Options(),
      autoFirstPage: true,
      info: {
        Title: `Commande ${payload.magasin.code} ${payload.dateIso}`,
        Author: "O Petit Frais",
        Subject: `Ticket A4 ${TICKET_PAGE_WIDTH_MM}x${TICKET_PAGE_HEIGHT_MM}mm`,
      },
    });

    try {
      registerFonts(doc, lang);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    pagesToRender.forEach((pageBlocks, idx) => {
      if (idx > 0) {
        doc.addPage(a4Options());
      }
      for (const block of pageBlocks) {
        drawBlock(doc, block, payload, lang, labels);
      }
    });

    doc.end();
  });
}
