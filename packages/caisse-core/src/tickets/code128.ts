import { concatBytes, encodeLatin1 } from "../format/bytes.js";

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Donnees CODE128 pour Epson GS k 73 :
 * prefixe {B + texte ASCII (checksum/stop calcules par l'imprimante).
 * @see https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lk.html
 */
export function encodeCode128EpsonData(text: string): Uint8Array {
  const sanitized = text.trim();
  if (sanitized.length === 0) {
    throw new Error("Code-barres vide");
  }
  const escaped = sanitized.replace(/\{/g, "{{");
  return encodeLatin1(`{B${escaped}`);
}

export type EscPosBarcodeOptions = {
  height?: number;
  moduleWidth?: number;
  /** 0=aucun, 1=au-dessus, 2=en-dessous, 3=les deux */
  hriPosition?: 0 | 1 | 2 | 3;
};

/** Imprime un code-barres CODE128 (GS k 73) — format Epson natif. */
export function escPosCode128Barcode(
  text: string,
  options: EscPosBarcodeOptions = {},
): Uint8Array {
  const data = encodeCode128EpsonData(text);
  const height = options.height ?? 72;
  const moduleWidth = Math.min(6, Math.max(2, options.moduleWidth ?? 3));
  const hriPosition = options.hriPosition ?? 2;

  return concatBytes([
    new Uint8Array([GS, 0x68, height]),
    new Uint8Array([GS, 0x77, moduleWidth]),
    new Uint8Array([GS, 0x48, hriPosition]),
    new Uint8Array([GS, 0x6b, 73, data.length]),
    data,
  ]);
}

/** CODE128 centre, pleine largeur 80 mm. */
export function escPosCode128BarcodeFullWidth(
  text: string,
  options: EscPosBarcodeOptions = {},
): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x01]),
    escPosCode128Barcode(text, {
      height: options.height ?? 80,
      moduleWidth: options.moduleWidth ?? 3,
      hriPosition: options.hriPosition ?? 2,
    }),
    new Uint8Array([ESC, 0x61, 0x00]),
    new Uint8Array([0x0a, 0x0a]),
  ]);
}

/** Reprise modes texte normal avant code-barres (apres TOTAL double taille). */
export function escPosResetPrintModes(): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x45, 0x00]),
    new Uint8Array([ESC, 0x21, 0x00]),
    new Uint8Array([ESC, 0x61, 0x00]),
  ]);
}
