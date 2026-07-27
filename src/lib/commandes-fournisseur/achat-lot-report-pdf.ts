import path from "path";
import PDFDocument from "pdfkit";
import type { AchatLotReportPayload } from "@/lib/commandes-fournisseur/achat-lot-report-data";

const MM_TO_PT = 72 / 25.4;
const PAGE_W = 210 * MM_TO_PT;
const PAGE_H = 297 * MM_TO_PT;
const MARGIN_X = 36;
const MARGIN_Y = 40;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const FONT_AR = "ReportArabic";
const FONT_AR_BOLD = "ReportArabicBold";

const COLOR = {
  ink: "#1a2332",
  muted: "#5c6b7a",
  line: "#d0d7de",
  soft: "#f4f7fa",
  accent: "#0d6e6e",
  accentSoft: "#e6f3f3",
  white: "#ffffff",
  totalBg: "#0d6e6e",
};

/** Séparateur de milliers `/`, décimales `,`. Ex. : 12/345,67 */
function fmtNum(n: number, digits = 2): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(digits);
  const [intRaw, frac = ""] = fixed.split(".");
  const intGrouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, "/");
  const body = digits > 0 ? `${intGrouped},${frac}` : intGrouped;
  return neg ? `-${body}` : body;
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const hasFrac = Math.abs(rounded % 1) > 1e-9;
  return fmtNum(rounded, hasFrac ? 2 : 0);
}

function fmtMoney(n: number): string {
  return `${fmtNum(n)} DH`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function hasArabic(text: string): boolean {
  return ARABIC_RE.test(text);
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

function registerArabicFonts(doc: PDFKit.PDFDocument): void {
  const fonts = arabicFontPaths();
  doc.registerFont(FONT_AR, fonts.regular);
  doc.registerFont(FONT_AR_BOLD, fonts.bold);
}

function fontFor(text: string, bold = false): string {
  if (hasArabic(text)) return bold ? FONT_AR_BOLD : FONT_AR;
  return bold ? "Helvetica-Bold" : "Helvetica";
}

type TextOpts = PDFKit.Mixins.TextOptions & { bold?: boolean };

/** Police + RTL OpenType (`rtla`) quand le texte contient de l’arabe. */
function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: TextOpts = {},
): PDFKit.PDFDocument {
  const { bold, align, ...rest } = opts;
  const ar = hasArabic(text);
  return doc.font(fontFor(text, Boolean(bold))).text(text, x, y, {
    ...rest,
    align: align ?? (ar ? "right" : "left"),
    ...(ar ? { features: ["rtla"] } : {}),
  });
}

/** Colonnes produits (sans UdC) — somme ≈ CONTENT_W. */
const COL = {
  product: 230,
  qte: 60,
  uda: 56,
  pu: 88,
  total: 89,
} as const;

function pageOptions() {
  return {
    size: [PAGE_W, PAGE_H] as [number, number],
    margins: {
      top: MARGIN_Y,
      bottom: MARGIN_Y,
      left: MARGIN_X,
      right: MARGIN_X,
    },
  };
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > PAGE_H - MARGIN_Y) {
    doc.addPage(pageOptions());
  }
}

function drawHeader(doc: PDFKit.PDFDocument, payload: AchatLotReportPayload): void {
  const top = MARGIN_Y - 8;

  doc.save();
  doc.rect(0, 0, PAGE_W, 8).fill(COLOR.accent);
  doc.restore();

  doc
    .fillColor(COLOR.accent)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("O PETIT FRAIS", MARGIN_X, top + 14, { width: CONTENT_W, characterSpacing: 1.2 });

  doc
    .fillColor(COLOR.ink)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Rapport d'achat", MARGIN_X, top + 28, { width: CONTENT_W });

  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(9)
    .text("Commande fournisseur — détail des achats", MARGIN_X, top + 52, {
      width: CONTENT_W,
    });

  const metaY = top + 72;
  doc.save();
  doc.roundedRect(MARGIN_X, metaY, CONTENT_W, 54, 6).fill(COLOR.soft);
  doc.restore();

  const colW = CONTENT_W / 2 - 8;
  const leftX = MARGIN_X + 12;
  const rightX = MARGIN_X + CONTENT_W / 2 + 4;

  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("FOURNISSEUR", leftX, metaY + 10);
  doc.fillColor(COLOR.ink).fontSize(12);
  drawText(doc, payload.supplierLabel, leftX, metaY + 22, {
    width: colW,
    bold: true,
  });

  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("STATUT", rightX, metaY + 10);
  const statusLabel =
    payload.status === "terminee"
      ? "Terminé"
      : payload.status === "prete"
        ? "Prêt"
        : payload.status;
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(statusLabel, rightX, metaY + 22, { width: colW });

  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(`Préparée : ${fmtDate(payload.marquePreteAt)}`, leftX, metaY + 38, {
      width: colW,
    });
  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(`Clôturée : ${fmtDate(payload.marqueTermineeAt)}`, rightX, metaY + 38, {
      width: colW,
    });

  doc.y = metaY + 66;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 36);
  const bandH = 22;
  const y = doc.y + 6;
  doc.save();
  doc.roundedRect(MARGIN_X, y, CONTENT_W, bandH, 4).fill(COLOR.accentSoft);
  doc.rect(MARGIN_X, y, 4, bandH).fill(COLOR.accent);
  doc.restore();

  const fontSize = 10;
  doc.font(fontFor(title, true)).fontSize(fontSize);
  const textH = doc.heightOfString(title, {
    width: CONTENT_W - 16,
    align: "center",
    ...(hasArabic(title) ? { features: ["rtla"] } : {}),
  });
  const textY = y + Math.max(0, (bandH - textH) / 2);

  doc.fillColor(COLOR.accent);
  drawText(doc, title, MARGIN_X + 8, textY, {
    width: CONTENT_W - 16,
    bold: true,
    align: "center",
    lineBreak: false,
  });
  doc.y = y + bandH + 6;
}

function drawTableHeader(doc: PDFKit.PDFDocument): void {
  ensureSpace(doc, 22);
  const y = doc.y;
  doc.save();
  doc.rect(MARGIN_X, y, CONTENT_W, 18).fill(COLOR.ink);
  doc.restore();

  doc.fillColor(COLOR.white).font("Helvetica-Bold").fontSize(7.5);
  let x = MARGIN_X + 4;
  const rowY = y + 5;
  doc.text("Produit", x, rowY, { width: COL.product - 4 });
  x += COL.product;
  doc.text("Qté", x, rowY, { width: COL.qte - 2, align: "right" });
  x += COL.qte;
  doc.text("UdA", x, rowY, { width: COL.uda - 2 });
  x += COL.uda;
  doc.text("P.U.", x, rowY, { width: COL.pu - 2, align: "right" });
  x += COL.pu;
  doc.text("Total", x, rowY, { width: COL.total - 6, align: "right" });
  doc.y = y + 20;
}

function drawProductRow(
  doc: PDFKit.PDFDocument,
  line: AchatLotReportPayload["sections"][number]["lines"][number],
  zebra: boolean,
): void {
  doc.font(fontFor(line.productName)).fontSize(8);
  const nameH = doc.heightOfString(line.productName, {
    width: COL.product - 4,
    ...(hasArabic(line.productName) ? { features: ["rtla"] } : {}),
  });
  const rowH = Math.max(16, nameH + 8);
  ensureSpace(doc, rowH + 2);
  const y = doc.y;

  if (zebra) {
    doc.save();
    doc.rect(MARGIN_X, y, CONTENT_W, rowH).fill("#f8fafc");
    doc.restore();
  }

  let x = MARGIN_X + 4;
  doc.fillColor(COLOR.ink).fontSize(8);
  drawText(doc, line.productName, x, y + 4, { width: COL.product - 4 });
  x += COL.product;
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica")
    .text(fmtQty(line.qteAchat), x, y + 4, {
      width: COL.qte - 2,
      align: "right",
    });
  x += COL.qte;
  doc.fillColor(COLOR.muted);
  drawText(doc, line.udaLabel, x, y + 4, { width: COL.uda - 2 });
  x += COL.uda;
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica")
    .text(line.prixUnitaire != null ? fmtNum(line.prixUnitaire) : "—", x, y + 4, {
      width: COL.pu - 2,
      align: "right",
    });
  x += COL.pu;
  doc.font("Helvetica-Bold").text(fmtNum(line.montant), x, y + 4, {
    width: COL.total - 6,
    align: "right",
  });

  doc
    .strokeColor(COLOR.line)
    .lineWidth(0.4)
    .moveTo(MARGIN_X, y + rowH)
    .lineTo(MARGIN_X + CONTENT_W, y + rowH)
    .stroke();

  doc.y = y + rowH;
}

function drawSectionSubtotal(doc: PDFKit.PDFDocument, amount: number): void {
  ensureSpace(doc, 22);
  const y = doc.y + 2;
  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("Sous-total produits", MARGIN_X, y + 4, { width: CONTENT_W - COL.total - 8 });
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(fmtMoney(amount), MARGIN_X + CONTENT_W - COL.total - 4, y + 3, {
      width: COL.total,
      align: "right",
    });
  doc.y = y + 20;
}

function drawFrais(doc: PDFKit.PDFDocument, payload: AchatLotReportPayload): void {
  if (payload.frais.length === 0) return;

  drawSectionTitle(doc, "Frais généraux");
  drawTableHeaderSimple(doc, ["Libellé", "Montant"]);

  payload.frais.forEach((f, i) => {
    ensureSpace(doc, 18);
    const y = doc.y;
    if (i % 2 === 1) {
      doc.save();
      doc.rect(MARGIN_X, y, CONTENT_W, 16).fill("#f8fafc");
      doc.restore();
    }
    doc.fillColor(COLOR.ink).fontSize(8);
    drawText(doc, f.label, MARGIN_X + 4, y + 4, {
      width: CONTENT_W - COL.total - 12,
    });
    doc
      .font("Helvetica-Bold")
      .text(fmtNum(f.montant), MARGIN_X + CONTENT_W - COL.total - 4, y + 4, {
        width: COL.total,
        align: "right",
      });
    doc.y = y + 16;
  });

  ensureSpace(doc, 20);
  const y = doc.y + 2;
  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("Total frais", MARGIN_X, y + 4);
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(fmtMoney(payload.totalFrais), MARGIN_X + CONTENT_W - COL.total - 4, y + 3, {
      width: COL.total,
      align: "right",
    });
  doc.y = y + 22;
}

function drawTableHeaderSimple(doc: PDFKit.PDFDocument, labels: [string, string]): void {
  ensureSpace(doc, 20);
  const y = doc.y;
  doc.save();
  doc.rect(MARGIN_X, y, CONTENT_W, 18).fill(COLOR.ink);
  doc.restore();
  doc.fillColor(COLOR.white).font("Helvetica-Bold").fontSize(7.5);
  doc.text(labels[0], MARGIN_X + 4, y + 5, { width: CONTENT_W - COL.total - 12 });
  doc.text(labels[1], MARGIN_X + CONTENT_W - COL.total - 4, y + 5, {
    width: COL.total,
    align: "right",
  });
  doc.y = y + 20;
}

function drawTotals(doc: PDFKit.PDFDocument, payload: AchatLotReportPayload): void {
  ensureSpace(doc, 96);
  const boxH = 86;
  const y = doc.y + 10;

  doc.save();
  doc.roundedRect(MARGIN_X, y, CONTENT_W, boxH, 8).fill(COLOR.soft);
  doc.roundedRect(MARGIN_X + CONTENT_W - 200, y, 200, boxH, 8).fill(COLOR.totalBg);
  doc.restore();

  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("RÉCAPITULATIF", MARGIN_X + 14, y + 12);
  doc
    .fillColor(COLOR.ink)
    .font("Helvetica")
    .fontSize(9)
    .text(`Total produits`, MARGIN_X + 14, y + 30);
  doc
    .font("Helvetica-Bold")
    .text(fmtMoney(payload.totalProduits), MARGIN_X + 120, y + 30);
  doc
    .font("Helvetica")
    .text(`Total frais`, MARGIN_X + 14, y + 46);
  doc
    .font("Helvetica-Bold")
    .text(fmtMoney(payload.totalFrais), MARGIN_X + 120, y + 46);

  doc
    .fillColor(COLOR.white)
    .font("Helvetica")
    .fontSize(8)
    .text("TOTAL GÉNÉRAL", MARGIN_X + CONTENT_W - 186, y + 22, {
      width: 172,
      align: "right",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(fmtMoney(payload.totalGeneral), MARGIN_X + CONTENT_W - 186, y + 40, {
      width: 172,
      align: "right",
    });

  doc.y = y + boxH + 16;
}

function drawFooter(doc: PDFKit.PDFDocument, page: number, pages: number): void {
  const y = PAGE_H - 28;
  doc
    .strokeColor(COLOR.line)
    .lineWidth(0.6)
    .moveTo(MARGIN_X, y - 6)
    .lineTo(MARGIN_X + CONTENT_W, y - 6)
    .stroke();
  doc
    .fillColor(COLOR.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text("O Petit Frais — Rapport d'achat fournisseur", MARGIN_X, y, {
      width: CONTENT_W / 2,
    });
  doc.text(`Page ${page} / ${pages}`, MARGIN_X + CONTENT_W / 2, y, {
    width: CONTENT_W / 2,
    align: "right",
  });
}

export function buildAchatLotReportPdf(payload: AchatLotReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...pageOptions(),
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: `Rapport achat — ${payload.supplierLabel}`,
        Author: "O Petit Frais",
        Subject: "Rapport d'achat commande fournisseur",
      },
    });

    try {
      registerArabicFonts(doc);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve(buf);
    });
    doc.on("error", (err: Error) => reject(err));

    drawHeader(doc, payload);

    if (payload.sections.length === 0) {
      doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(10)
        .text("Aucune ligne produit sur ce lot.", MARGIN_X, doc.y + 12);
    } else {
      for (const section of payload.sections) {
        drawSectionTitle(doc, section.title);
        drawTableHeader(doc);
        section.lines.forEach((line, idx) => {
          drawProductRow(doc, line, idx % 2 === 1);
        });
        drawSectionSubtotal(doc, section.totalProduits);
      }
    }

    drawFrais(doc, payload);
    drawTotals(doc, payload);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

export function achatLotReportPdfFilename(payload: AchatLotReportPayload): string {
  const slug = payload.supplierLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  const shortId = payload.lotId.replace(/-/g, "").slice(0, 8);
  return `rapport-achat-${slug || "lot"}-${shortId}.pdf`;
}
