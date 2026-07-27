/** Devise de saisie achat par vendeur. Les montants en base restent en DH. */

export type DeviseAchat = "dirham" | "rial";

/** 1 Dirham = 20 Rial. */
export const RIAL_PER_DH = 20;

export function parseDeviseAchat(raw: unknown): DeviseAchat {
  return raw === "rial" ? "rial" : "dirham";
}

export function isDeviseAchat(raw: unknown): raw is DeviseAchat {
  return raw === "dirham" || raw === "rial";
}

export function dhToRial(dh: number): number {
  if (!Number.isFinite(dh)) return 0;
  return Math.round(dh * RIAL_PER_DH * 100) / 100;
}

export function rialToDh(rial: number): number {
  if (!Number.isFinite(rial)) return 0;
  return Math.round((rial / RIAL_PER_DH) * 100) / 100;
}

/** Convertit un montant saisi (devise UI) vers DH stocké. */
export function displayMontantToDh(amount: number, devise: DeviseAchat): number {
  return devise === "rial" ? rialToDh(amount) : Math.round(amount * 100) / 100;
}

/** Convertit un montant DH stocké vers devise d'affichage. */
export function dhToDisplayMontant(amountDh: number, devise: DeviseAchat): number {
  return devise === "rial" ? dhToRial(amountDh) : Math.round(amountDh * 100) / 100;
}

export function montantTextFromNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

export function parseMontantText(txt: string): number | null {
  const trimmed = txt.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Texte montant DH → texte montant devise d'affichage. */
export function dhTextToDisplayText(dhText: string, devise: DeviseAchat): string {
  if (devise === "dirham") return dhText;
  const n = parseMontantText(dhText);
  if (n == null) return "";
  return montantTextFromNumber(dhToRial(n));
}

/** Texte montant devise UI → texte montant DH. */
export function displayTextToDhText(displayText: string, devise: DeviseAchat): string {
  if (devise === "dirham") return displayText;
  const n = parseMontantText(displayText);
  if (n == null) return "";
  return montantTextFromNumber(rialToDh(n));
}
