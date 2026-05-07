/** Saisie / persistance quantités avec au plus 2 décimales (commandes / lots). */

export const QTY_MAX_FRACTION_DIGITS = 2;

/** Arrondi demi-au-sup — échelle cents. */
export function roundQty2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Borne utilisée par l’API (évite aberrations client). */
export function clampQtyToApiRange(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1_000_000_000, roundQty2(n)));
}

/** Texte hors focus : vide si 0 pour permettre suppression visuelle puis resaisie (cf. champ numérique MUI « 0 » collant). */
export function formatQtyDisplayWhenBlurred(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: QTY_MAX_FRACTION_DIGITS,
  });
}

/**
 * Pendant la frappe : conserve un motif numérique cohérent (séparateur "," ou "."), max 2 décimales.
 * Retour utilise "," comme séparateur décimal FR (sans normaliser encore le nombre).
 */
export function sanitizeQtyTypingFrac2(raw: string): string {
  const s0 = raw.replace(/\s+/g, "");
  let sepIdx = -1;
  let sepChar = "";
  const comma = s0.indexOf(",");
  const dot = s0.indexOf(".");
  if (comma >= 0 && dot >= 0) {
    sepIdx = comma < dot ? comma : dot;
    sepChar = comma < dot ? "," : ".";
  } else if (comma >= 0) {
    sepIdx = comma;
    sepChar = ",";
  } else if (dot >= 0) {
    sepIdx = dot;
    sepChar = ".";
  }

  let intRaw = sepIdx >= 0 ? s0.slice(0, sepIdx) : s0;
  let fracRaw = sepIdx >= 0 ? s0.slice(sepIdx + 1) : "";
  fracRaw = fracRaw.replace(sepChar === "," ? /\./g : /,/g, "");
  intRaw = intRaw.replace(/[^\d]/g, "");
  fracRaw = fracRaw.replace(/[^\d]/g, "").slice(0, QTY_MAX_FRACTION_DIGITS);

  let out = intRaw;
  if (sepIdx >= 0) {
    out += fracRaw.length > 0 || s0.endsWith(sepChar) ? `,${fracRaw}` : "";
  }
  return out;
}

/** Montants (DH) : mêmes règles que les quantités (séparateur, max 2 décimales). */
export function sanitizeMontantDhTypingFrac2(raw: string): string {
  return sanitizeQtyTypingFrac2(raw);
}

/** Interprète la chaîne saisie : `null` si chaîne vide / non numérique. */
export function parseQtyInputToNumber(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return roundQty2(n);
}
