import type { CommandeTicketPayload } from "@/lib/caisse/commande-ticket-data";
import { formatQty } from "@/lib/caisse/commande-ticket-data";
import { buildCommandeTicketEscPosRaster } from "@/lib/caisse/commande-ticket-raster";
import { ticketUiLabels } from "@/lib/caisse/ticket-lang";

/**
 * Largeur ticket 80 mm — Font B ESC/POS ≈ 64 car.
 * Qté décalée ~1 cm à gauche ; unité / conditionnement à droite.
 */
const COLS = 64;
const NAME_W = 25;
const QTY_W = 5;
const UNIT_W = 31;
const GAP_NAME_QTY = " ";
const GAP_QTY_UNIT = "  ";
/**
 * Largeur du bandeau fournisseur (Font A + gras + double hauteur).
 * Plus large que Font B → ~42 car. max sur 80 mm ; calé à 39 (un de trop à 40).
 */
const BANNER_COLS = 39;

function padCenter(text: string, width = COLS): string {
  const t = text.trim();
  if (t.length >= width) return t.slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  return " ".repeat(left) + t + " ".repeat(width - t.length - left);
}

function padRight(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text;
  return t + " ".repeat(Math.max(0, width - t.length));
}

function padLeft(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text;
  return " ".repeat(Math.max(0, width - t.length)) + t;
}

function formatDateFr(dateIso: string): string {
  if (!dateIso) return "-";
  const [y, m, d] = dateIso.split("-");
  if (!y || !m || !d) return dateIso;
  return `${d}/${m}/${y}`;
}

function formatHeaderRow(product: string, qty: string, unit: string): string {
  return (
    padRight(product, NAME_W) +
    GAP_NAME_QTY +
    padLeft(qty, QTY_W) +
    GAP_QTY_UNIT +
    padRight(unit, UNIT_W)
  );
}

function formatDataRow(name: string, qty: string, unit: string): string[] {
  const qtyUnit =
    GAP_NAME_QTY + padLeft(qty, QTY_W) + GAP_QTY_UNIT + padRight(unit, UNIT_W);
  const rows: string[] = [];
  if (name.length <= NAME_W) {
    rows.push(padRight(name, NAME_W) + qtyUnit);
  } else {
    rows.push(padRight(name.slice(0, NAME_W), NAME_W));
    const rest = name.slice(NAME_W).trim();
    if (rest.length > 0) {
      rows.push(padRight(rest.slice(0, NAME_W), NAME_W));
    }
    rows.push(padRight("", NAME_W) + qtyUnit);
  }
  return rows;
}

/** Unité, ou conditionnement à la place si présent. */
function unitOrPackaging(unitLabel: string, packagingLabel: string | null): string {
  const pack = packagingLabel?.trim();
  if (pack && pack.length > 0) return pack;
  return unitLabel;
}

function sanitizeTicketText(text: string): string {
  return text
    .replace(/\u2014|\u2013|\u2212/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\u2026/g, "...");
}

/** FR : latin1 / CP1252. L’arabe passe par le raster (voir buildCommandeTicketEscPos). */
function encodePrinterText(text: string): Buffer {
  const safe = sanitizeTicketText(text);
  const latin1 = safe.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
  return Buffer.from(latin1, "latin1");
}

function crlf(): Buffer {
  return Buffer.from("\r\n", "latin1");
}

function lineBuf(text: string): Buffer {
  return Buffer.concat([encodePrinterText(text), crlf()]);
}

/** Bandeau fournisseur : fond noir, texte blanc, plus grand, centré (ESC a). */
function supplierBannerEscPos(label: string): Buffer {
  const title = padCenter(label.trim().toUpperCase(), BANNER_COLS);
  return Buffer.concat([
    Buffer.from([0x1b, 0x61, 0x01]), // ESC a 1 : alignement centré
    Buffer.from([0x1b, 0x21, 0x18]), // gras + double hauteur (Font A)
    Buffer.from([0x1d, 0x42, 0x01]), // inversion ON
    encodePrinterText(title),
    Buffer.from([0x1d, 0x42, 0x00]), // inversion OFF
    Buffer.from([0x1b, 0x21, 0x01]), // Font B normal
    Buffer.from([0x1b, 0x4d, 0x01]),
    crlf(),
    Buffer.from([0x1b, 0x61, 0x00]), // ESC a 0 : retour alignement gauche
  ]);
}

function escPosHeader(): Buffer {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]), // ESC @
    Buffer.from([0x1b, 0x52, 0x01]), // France
    Buffer.from([0x1b, 0x74, 0x10]), // WPC1252
    Buffer.from([0x1b, 0x4d, 0x01]), // Font B
    Buffer.from([0x1b, 0x33, 0x20]), // interligne serré
  ]);
}

function escPosFooter(): Buffer {
  return Buffer.concat([
    Buffer.from([0x0a, 0x0a]),
    Buffer.from([0x1d, 0x56, 0x41, 0x03]), // coupe partielle
  ]);
}

/**
 * Buffer ESC/POS prêt à `copy /b`.
 * FR = texte CP1252 ; AR = image (Noto) car les pages de codes arabes
 * ne sont pas fiables sur les imprimantes ticket.
 */
export async function buildCommandeTicketEscPos(
  payload: CommandeTicketPayload,
): Promise<Buffer> {
  if ((payload.lang ?? "fr") === "ar") {
    return buildCommandeTicketEscPosRaster(payload);
  }

  const labels = ticketUiLabels("fr");
  const chunks: Buffer[] = [escPosHeader()];

  const magasinTitle =
    payload.magasin.nom?.trim() || payload.magasin.code || "Magasin";

  chunks.push(lineBuf(padCenter(magasinTitle)));
  chunks.push(lineBuf(padCenter(payload.magasin.code)));
  chunks.push(lineBuf(padCenter(labels.title)));

  if (payload.suppliers.length === 0) {
    chunks.push(lineBuf(padCenter(labels.empty)));
    chunks.push(escPosFooter());
    return Buffer.concat(chunks);
  }

  for (const supplier of payload.suppliers) {
    chunks.push(crlf());
    chunks.push(supplierBannerEscPos(supplier.supplierLabel));
    chunks.push(
      lineBuf(padCenter(`${labels.datePrefix} : ${formatDateFr(supplier.dateIso)}`)),
    );
    chunks.push(crlf()); // ligne vide sous la date

    if (supplier.groups.length === 0) {
      chunks.push(lineBuf(padCenter(labels.noLines)));
      continue;
    }

    chunks.push(
      lineBuf(formatHeaderRow(labels.productCol, labels.qtyCol, labels.unitCol)),
    );
    chunks.push(lineBuf("-".repeat(COLS)));

    for (const group of supplier.groups) {
      chunks.push(lineBuf(padCenter(group.categoryLabel.toUpperCase())));

      for (const row of group.lines) {
        for (const dataLine of formatDataRow(
          row.productName,
          formatQty(row.qty),
          unitOrPackaging(row.unitLabel, row.packagingLabel),
        )) {
          chunks.push(lineBuf(dataLine));
        }
      }
    }
  }

  chunks.push(crlf());
  chunks.push(
    lineBuf(padCenter(labels.footer(payload.suppliers.length, payload.lineCount))),
  );
  chunks.push(escPosFooter());

  return Buffer.concat(chunks);
}

/**
 * @deprecated Préférer `buildCommandeTicketEscPos`.
 */
export function encodeTicketTextWindows1252(text: string): Buffer {
  return Buffer.concat([escPosHeader(), encodePrinterText(text), escPosFooter()]);
}

/** Ticket texte compact (aperçu sans commandes ESC/POS avancées). */
export function buildCommandeTicketText(payload: CommandeTicketPayload): string {
  const lang = payload.lang ?? "fr";
  const labels = ticketUiLabels(lang);
  const out: string[] = [];

  const magasinTitle =
    payload.magasin.nom?.trim() || payload.magasin.code || "Magasin";

  out.push(padCenter(magasinTitle));
  out.push(padCenter(payload.magasin.code));
  out.push(padCenter(labels.title));

  if (payload.suppliers.length === 0) {
    out.push(padCenter(labels.empty));
    return sanitizeTicketText(out.join("\r\n") + "\r\n");
  }

  for (const supplier of payload.suppliers) {
    out.push("");
    out.push(
      padCenter(
        lang === "ar"
          ? supplier.supplierLabel
          : supplier.supplierLabel.toUpperCase(),
      ),
    );
    out.push(padCenter(`${labels.datePrefix} : ${formatDateFr(supplier.dateIso)}`));
    out.push("");

    if (supplier.groups.length === 0) {
      out.push(padCenter(labels.noLines));
      continue;
    }

    out.push(formatHeaderRow(labels.productCol, labels.qtyCol, labels.unitCol));
    out.push("-".repeat(COLS));

    for (const group of supplier.groups) {
      out.push(
        padCenter(
          lang === "ar"
            ? group.categoryLabel
            : group.categoryLabel.toUpperCase(),
        ),
      );

      for (const row of group.lines) {
        out.push(
          ...formatDataRow(
            row.productName,
            formatQty(row.qty),
            unitOrPackaging(row.unitLabel, row.packagingLabel),
          ),
        );
      }
    }
  }

  out.push("");
  out.push(padCenter(labels.footer(payload.suppliers.length, payload.lineCount)));

  return sanitizeTicketText(out.join("\r\n") + "\r\n");
}

/** JSON aplati pour un état WinDev. */
export function buildCommandeTicketJson(payload: CommandeTicketPayload) {
  const labels = ticketUiLabels(payload.lang);
  return {
    magasin: {
      code: payload.magasin.code,
      nom: payload.magasin.nom,
    },
    dateIso: payload.dateIso,
    lang: payload.lang,
    labels: {
      title: labels.title,
      productCol: labels.productCol,
      qtyCol: labels.qtyCol,
      unitCol: labels.unitCol,
      datePrefix: labels.datePrefix,
    },
    lineCount: payload.lineCount,
    suppliers: payload.suppliers.map((s) => ({
      label: s.supplierLabel,
      dateIso: s.dateIso,
      commandeId: s.commandeId,
      categories: s.groups.map((g) => ({
        label: g.categoryLabel,
        lines: g.lines.map((l) => ({
          name: l.productName,
          code: l.productCode,
          qty: l.qty,
          qtyLabel: formatQty(l.qty),
          unit: l.unitLabel,
          packaging: l.packagingLabel,
        })),
      })),
    })),
  };
}
