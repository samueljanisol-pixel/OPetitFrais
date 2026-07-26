import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { CommandeTicketPayload } from "@/lib/caisse/commande-ticket-data";
import { formatQty } from "@/lib/caisse/commande-ticket-data";
import { ticketUiLabels } from "@/lib/caisse/ticket-lang";

/** Largeur utile 80 mm @ ~203 dpi (multiple de 8). */
const IMG_W = 576;
const MARGIN = 8;
const CONTENT_W = IMG_W - MARGIN * 2;
const LINE_H = 32;
const BANNER_H = 46;
const FONT_SIZE = 28;
const QTY_SIZE = 20;
const BANNER_SIZE = 32;
const TITLE_SIZE = 30;
const STRIP_H = 240;

type DrawOp =
  | { kind: "blank"; h: number }
  | { kind: "text"; text: string; align: "left" | "center" | "right"; bold?: boolean; size?: number }
  | { kind: "banner"; text: string }
  | { kind: "rule" }
  | {
      kind: "row";
      name: string;
      qty: string;
      unit: string;
    };

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateFr(dateIso: string): string {
  if (!dateIso) return "-";
  const [y, m, d] = dateIso.split("-");
  if (!y || !m || !d) return dateIso;
  return `${d}/${m}/${y}`;
}

function unitOrPackaging(unitLabel: string, packagingLabel: string | null): string {
  const pack = packagingLabel?.trim();
  if (pack && pack.length > 0) return pack;
  return unitLabel;
}

function loadFontDataUris(): { arabic: string; latin: string; boldAr: string } {
  const base = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans-arabic",
    "files",
  );
  const read = (name: string) =>
    `data:font/woff2;base64,${fs.readFileSync(path.join(base, name)).toString("base64")}`;
  return {
    arabic: read("noto-sans-arabic-arabic-400-normal.woff2"),
    latin: read("noto-sans-arabic-latin-400-normal.woff2"),
    boldAr: read("noto-sans-arabic-arabic-700-normal.woff2"),
  };
}

function buildOps(payload: CommandeTicketPayload): DrawOp[] {
  const labels = ticketUiLabels("ar");
  const ops: DrawOp[] = [];

  const magasinTitle =
    payload.magasin.nom?.trim() || payload.magasin.code || "Magasin";

  ops.push({ kind: "text", text: magasinTitle, align: "center", bold: true, size: TITLE_SIZE });
  ops.push({ kind: "text", text: payload.magasin.code, align: "center", size: FONT_SIZE });
  ops.push({ kind: "text", text: labels.title, align: "center", bold: true, size: TITLE_SIZE });

  if (payload.suppliers.length === 0) {
    ops.push({ kind: "blank", h: 4 });
    ops.push({ kind: "text", text: labels.empty, align: "center" });
    return ops;
  }

  for (const supplier of payload.suppliers) {
    ops.push({ kind: "blank", h: 6 });
    ops.push({ kind: "banner", text: supplier.supplierLabel.trim() });
    ops.push({
      kind: "text",
      text: `${labels.datePrefix} : ${formatDateFr(supplier.dateIso)}`,
      align: "center",
    });
    ops.push({ kind: "blank", h: Math.round(LINE_H * 0.55) }); // ligne vide sous la date

    if (supplier.groups.length === 0) {
      ops.push({ kind: "text", text: labels.noLines, align: "center" });
      continue;
    }

    // En-têtes une fois par fournisseur (RTL : produit à droite)
    ops.push({
      kind: "row",
      name: labels.productCol,
      qty: labels.qtyCol,
      unit: labels.unitCol,
    });
    ops.push({ kind: "rule" });

    for (const group of supplier.groups) {
      ops.push({
        kind: "text",
        text: group.categoryLabel,
        align: "center",
        bold: true,
      });

      for (const row of group.lines) {
        ops.push({
          kind: "row",
          name: row.productName,
          qty: formatQty(row.qty),
          unit: unitOrPackaging(row.unitLabel, row.packagingLabel),
        });
      }
    }
  }

  ops.push({ kind: "blank", h: 4 });
  ops.push({
    kind: "text",
    text: labels.footer(payload.suppliers.length, payload.lineCount),
    align: "center",
    size: 20,
  });
  ops.push({ kind: "blank", h: 4 });

  return ops;
}

function opHeight(op: DrawOp): number {
  switch (op.kind) {
    case "blank":
      return op.h;
    case "banner":
      return BANNER_H + 4;
    case "rule":
      return 6;
    case "text":
      return Math.max(LINE_H, (op.size ?? FONT_SIZE) + 6);
    default:
      return LINE_H;
  }
}

function renderOpsToSvg(ops: DrawOp[], fonts: ReturnType<typeof loadFontDataUris>): string {
  const height = Math.max(
    40,
    ops.reduce((sum, op) => sum + opHeight(op), 0) + 16,
  );

  const nameW = Math.floor(CONTENT_W * 0.52);
  const qtyW = Math.floor(CONTENT_W * 0.14);
  const unitW = CONTENT_W - nameW - qtyW;

  let y = 20;
  const parts: string[] = [];

  for (const op of ops) {
    const h = opHeight(op);

    if (op.kind === "blank") {
      y += h;
      continue;
    }

    if (op.kind === "rule") {
      const ry = y + 2;
      parts.push(
        `<line x1="${MARGIN}" y1="${ry}" x2="${MARGIN + CONTENT_W}" y2="${ry}" stroke="black" stroke-width="1"/>`,
      );
      y += h;
      continue;
    }

    if (op.kind === "banner") {
      const by = y;
      // Bandeau ~70 % de largeur (équivalent ~39 car. Font A), centré
      const bannerW = Math.floor(CONTENT_W * 0.7);
      const bx = MARGIN + Math.floor((CONTENT_W - bannerW) / 2);
      parts.push(
        `<rect x="${bx}" y="${by}" width="${bannerW}" height="${BANNER_H}" fill="black"/>`,
      );
      parts.push(
        `<text x="${MARGIN + CONTENT_W / 2}" y="${by + BANNER_H * 0.72}" text-anchor="middle" font-family="NotoArBold, NotoAr" font-size="${BANNER_SIZE}" fill="white">${escapeXml(op.text)}</text>`,
      );
      y += h;
      continue;
    }

    if (op.kind === "text") {
      const size = op.size ?? FONT_SIZE;
      const family = op.bold ? "NotoArBold, NotoAr" : "NotoAr";
      // Coordonnées LTR : l’arabe se positionne via le bidi Unicode (pas direction=rtl SVG,
      // qui inversait les ancres et ne laissait qu’1 glyphe visible).
      const x =
        op.align === "center"
          ? MARGIN + CONTENT_W / 2
          : op.align === "right"
            ? MARGIN + CONTENT_W
            : MARGIN;
      const anchor =
        op.align === "center" ? "middle" : op.align === "right" ? "end" : "start";
      parts.push(
        `<text x="${x}" y="${y + size}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" fill="black">${escapeXml(op.text)}</text>`,
      );
      y += h;
      continue;
    }

    // Colonnes LTR : unité | qté | nom — unité alignée à droite contre la qté
    const baseline = y + FONT_SIZE;
    const unitRightX = MARGIN + unitW - 4;
    const qtyX = MARGIN + unitW + qtyW / 2;
    const nameX = MARGIN + CONTENT_W;

    parts.push(
      `<text x="${unitRightX}" y="${baseline}" text-anchor="end" font-family="NotoAr" font-size="${FONT_SIZE}" fill="black">${escapeXml(op.unit)}</text>`,
    );
    parts.push(
      `<text x="${qtyX}" y="${baseline}" text-anchor="middle" font-family="NotoAr" font-size="${QTY_SIZE}" fill="black">${escapeXml(op.qty)}</text>`,
    );
    parts.push(
      `<text x="${nameX}" y="${baseline}" text-anchor="end" font-family="NotoAr" font-size="${FONT_SIZE}" fill="black">${escapeXml(op.name)}</text>`,
    );
    y += h;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${IMG_W}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css"><![CDATA[
      @font-face {
        font-family: 'NotoAr';
        src: url('${fonts.arabic}') format('woff2'), url('${fonts.latin}') format('woff2');
        font-weight: 400;
      }
      @font-face {
        font-family: 'NotoArBold';
        src: url('${fonts.boldAr}') format('woff2');
        font-weight: 700;
      }
    ]]></style>
  </defs>
  <rect width="100%" height="100%" fill="white"/>
  ${parts.join("\n  ")}
</svg>`;
}

/** Packe une image raw 8-bit (0=noir) en raster ESC/POS 1 bit (1=noir imprimé). */
function packMonoRaster(raw: Buffer, width: number, height: number): Buffer {
  const widthBytes = Math.ceil(width / 8);
  const out = Buffer.alloc(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = raw[y * width + x] ?? 255;
      if (lum < 128) {
        const bi = y * widthBytes + (x >> 3);
        out[bi] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

function gsV0Chunk(raster: Buffer, widthBytes: number, height: number): Buffer {
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;
  return Buffer.concat([
    Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    raster,
  ]);
}

/**
 * Ticket arabe en image ESC/POS (pas de page de codes imprimante).
 * Police Noto Sans Arabic via sharp/SVG.
 */
export async function buildCommandeTicketEscPosRaster(
  payload: CommandeTicketPayload,
): Promise<Buffer> {
  const fonts = loadFontDataUris();
  const ops = buildOps(payload);
  const svg = renderOpsToSvg(ops, fonts);

  const { data, info } = await sharp(Buffer.from(svg))
    .resize(IMG_W, null, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const widthBytes = Math.ceil(width / 8);
  const mono = packMonoRaster(data, width, height);

  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]), // ESC @
    Buffer.from([0x1b, 0x61, 0x01]), // centré (images)
  ];

  for (let y0 = 0; y0 < height; y0 += STRIP_H) {
    const h = Math.min(STRIP_H, height - y0);
    const slice = Buffer.alloc(widthBytes * h);
    for (let row = 0; row < h; row++) {
      mono.copy(
        slice,
        row * widthBytes,
        (y0 + row) * widthBytes,
        (y0 + row + 1) * widthBytes,
      );
    }
    chunks.push(gsV0Chunk(slice, widthBytes, h));
  }

  chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
  chunks.push(Buffer.from([0x0a, 0x0a]));
  chunks.push(Buffer.from([0x1d, 0x56, 0x41, 0x03])); // coupe

  return Buffer.concat(chunks);
}
