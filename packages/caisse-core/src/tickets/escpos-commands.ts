import { concatBytes, encodeLatin1 } from "../format/bytes.js";

const ESC = 0x1b;
const GS = 0x1d;

/** Texte ticket : ASCII imprimable uniquement (evite ?? sur imprimantes CP437). */
export function sanitizeTicketAscii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/gi, "oe")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}

/** Init minimale : reset + Font B 64 col. Pas de changement de page code (source des ??). */
export function escPosInit(): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x40]),
    new Uint8Array([ESC, 0x4d, 0x01]),
    new Uint8Array([ESC, 0x33, 0x24]),
  ]);
}

export function escPosCut(): Uint8Array {
  return new Uint8Array([GS, 0x56, 0x00]);
}

/** Ligne texte + saut de ligne LF (0x0A) — fiable en RAW Epson. */
export function escPosLine(text: string): Uint8Array {
  return concatBytes([encodeLatin1(sanitizeTicketAscii(text)), new Uint8Array([0x0a])]);
}

export function escPosBlankLine(): Uint8Array {
  return new Uint8Array([0x0a]);
}

export function escPosFeedLines(count: number): Uint8Array {
  const n = Math.min(255, Math.max(0, count));
  return new Uint8Array([ESC, 0x64, n]);
}

/** Avance papier de n points (ESC J), sans impression. */
export function escPosFeedDots(dots: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let remaining = Math.max(0, Math.round(dots));
  while (remaining > 0) {
    const step = Math.min(255, remaining);
    chunks.push(new Uint8Array([ESC, 0x4a, step]));
    remaining -= step;
  }
  return concatBytes(chunks);
}

export function escPosEnterPageMode(): Uint8Array {
  return new Uint8Array([ESC, 0x4c]);
}

/** Zone d'impression mode page (coin haut-gauche + coin bas-droit, en points). */
export function escPosSetPageArea(
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const dx = Math.max(x, x + width - 1);
  const dy = Math.max(y, y + height - 1);
  return new Uint8Array([
    ESC,
    0x57,
    x & 0xff,
    (x >> 8) & 0xff,
    y & 0xff,
    (y >> 8) & 0xff,
    dx & 0xff,
    (dx >> 8) & 0xff,
    dy & 0xff,
    (dy >> 8) & 0xff,
  ]);
}

export function escPosSetPrintDirection(direction: 0 | 1 | 2 | 3 = 0): Uint8Array {
  return new Uint8Array([ESC, 0x54, direction]);
}

/** Position verticale absolue en mode page (GS $). */
export function escPosSetAbsoluteVerticalPosition(dots: number): Uint8Array {
  const n = Math.max(0, Math.round(dots));
  return new Uint8Array([GS, 0x24, n & 0xff, (n >> 8) & 0xff]);
}

/** Position horizontale absolue en mode page (ESC $). */
export function escPosSetAbsoluteHorizontalPosition(dots: number): Uint8Array {
  const n = Math.max(0, Math.round(dots));
  return new Uint8Array([ESC, 0x24, n & 0xff, (n >> 8) & 0xff]);
}

/** Imprime le buffer mode page puis repasse en mode standard (FF). */
export function escPosPrintPageModeData(): Uint8Array {
  return new Uint8Array([0x0c]);
}

/** Ouvre le tiroir caisse (connecté à l'imprimante ticket) — WinDev : ESC + "p0". */
export function escPosOpenCashDrawer(): Uint8Array {
  return new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xfa]);
}

/** Ligne centree (ESC a 1) + retour alignement gauche. */
export function escPosLineCenter(text: string): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x01]),
    encodeLatin1(sanitizeTicketAscii(text)),
    new Uint8Array([0x0a]),
    new Uint8Array([ESC, 0x61, 0x00]),
  ]);
}

/** Page de codes WPC1252 (accents fr : é, à, ô…) — avant pied de ticket latin. */
export function escPosSelectCodePage1252(): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x52, 0x01]),
    new Uint8Array([ESC, 0x74, 0x10]),
  ]);
}

/** Ligne centree avec accents latin1 (pied de ticket). */
export function escPosLineCenterLatin(text: string): Uint8Array {
  const normalized = text.normalize("NFC");
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x01]),
    encodeLatin1(normalized),
    new Uint8Array([0x0a]),
    new Uint8Array([ESC, 0x61, 0x00]),
  ]);
}

/** Ligne texte latin1 (accents CP1252) + LF — pied de ticket. */
export function escPosLineLatin(text: string): Uint8Array {
  return concatBytes([encodeLatin1(text), new Uint8Array([0x0a])]);
}

export type EscPosTextStyle = {
  bold?: boolean;
  doubleWidth?: boolean;
  doubleHeight?: boolean;
  center?: boolean;
};

function escPosApplyTextStyle(style: EscPosTextStyle): Uint8Array {
  let mode = 0;
  if (style.doubleHeight) mode |= 0x10;
  if (style.doubleWidth) mode |= 0x20;
  const chunks: Uint8Array[] = [];
  if (style.center) chunks.push(new Uint8Array([ESC, 0x61, 0x01]));
  if (style.bold) chunks.push(new Uint8Array([ESC, 0x45, 0x01]));
  if (mode > 0) chunks.push(new Uint8Array([ESC, 0x21, mode]));
  return concatBytes(chunks);
}

function escPosResetTextStyle(): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x45, 0x00]),
    new Uint8Array([ESC, 0x21, 0x00]),
    new Uint8Array([ESC, 0x61, 0x00]),
  ]);
}

/** Ligne stylée (gras, double taille, centrage) + retour modes par défaut. */
export function escPosStyledLine(text: string, style: EscPosTextStyle = {}): Uint8Array {
  return concatBytes([
    escPosApplyTextStyle(style),
    encodeLatin1(sanitizeTicketAscii(text)),
    new Uint8Array([0x0a]),
    escPosResetTextStyle(),
  ]);
}

export type EscPosTextSegment = {
  text: string;
  style?: EscPosTextStyle;
};

/** Ligne avec segments de styles différents (ex. prix : entier gros + décimales petites). */
export function escPosStyledLineSegments(
  segments: EscPosTextSegment[],
  lineStyle: EscPosTextStyle = {},
  options: { newline?: boolean } = {},
): Uint8Array {
  const chunks: Uint8Array[] = [];
  if (lineStyle.center) {
    chunks.push(new Uint8Array([ESC, 0x61, 0x01]));
  }
  for (const segment of segments) {
    const { center: _center, ...segmentStyle } = { ...lineStyle, ...segment.style };
    chunks.push(
      escPosApplyTextStyle(segmentStyle),
      encodeLatin1(sanitizeTicketAscii(segment.text)),
    );
  }
  if (options.newline !== false) {
    chunks.push(new Uint8Array([0x0a]));
  }
  chunks.push(escPosResetTextStyle());
  return concatBytes(chunks);
}

/** Texte stylé à une position absolue (mode page). */
export function escPosStyledTextAt(
  xDots: number,
  yDots: number,
  text: string,
  style: EscPosTextStyle = {},
  options: { latin?: boolean; newline?: boolean } = {},
): Uint8Array {
  const chunks: Uint8Array[] = [
    escPosSetAbsoluteVerticalPosition(yDots),
    escPosSetAbsoluteHorizontalPosition(xDots),
    escPosApplyTextStyle(style),
  ];
  if (options.latin) {
    chunks.push(encodeLatin1(text.normalize("NFC")));
  } else {
    chunks.push(encodeLatin1(sanitizeTicketAscii(text)));
  }
  if (options.newline !== false) {
    chunks.push(new Uint8Array([0x0a]));
  }
  chunks.push(escPosResetTextStyle());
  return concatBytes(chunks);
}

/** Segments stylés à une position absolue (mode page). */
export function escPosStyledSegmentsAt(
  xDots: number,
  yDots: number,
  segments: EscPosTextSegment[],
  lineStyle: EscPosTextStyle = {},
  options: { newline?: boolean } = {},
): Uint8Array {
  const chunks: Uint8Array[] = [
    escPosSetAbsoluteVerticalPosition(yDots),
    escPosSetAbsoluteHorizontalPosition(xDots),
  ];
  if (lineStyle.center) {
    chunks.push(new Uint8Array([ESC, 0x61, 0x01]));
  }
  for (const segment of segments) {
    const { center: _center, ...segmentStyle } = { ...lineStyle, ...segment.style };
    chunks.push(
      escPosApplyTextStyle(segmentStyle),
      encodeLatin1(sanitizeTicketAscii(segment.text)),
    );
  }
  if (options.newline !== false) {
    chunks.push(new Uint8Array([0x0a]));
  }
  chunks.push(escPosResetTextStyle());
  return concatBytes(chunks);
}

/** Ligne TOTAL : gras, double taille, alignee a droite (juste sous le trait). */
export function escPosTicketTotalLine(totalLabel: string): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x02]),
    new Uint8Array([ESC, 0x21, 0x18]),
    new Uint8Array([ESC, 0x45, 0x01]),
    encodeLatin1(sanitizeTicketAscii(totalLabel)),
    new Uint8Array([0x0a]),
    new Uint8Array([ESC, 0x45, 0x00]),
    new Uint8Array([ESC, 0x21, 0x00]),
    new Uint8Array([ESC, 0x61, 0x00]),
  ]);
}
