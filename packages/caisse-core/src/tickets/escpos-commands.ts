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
