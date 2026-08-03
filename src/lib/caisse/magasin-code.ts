/** Codes magasin caisse (00, 01…) ↔ codes base (M00, M01…). */

export function parseMagasinNumeric(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatMagasinCodeMx(raw: string): string | null {
  const n = parseMagasinNumeric(raw);
  if (n == null) return null;
  return `M${String(n).padStart(2, "0")}`;
}

export function isTestMagasinCode(magasinCode: string): boolean {
  return parseMagasinNumeric(magasinCode) === 0;
}

export const TEST_MAGASIN_CODE_MX = "M00";

/** Variantes à tester pour retrouver un magasin en base. */
export function magasinCodeLookupCandidates(magasinCode: string): string[] {
  const raw = magasinCode.trim();
  const out = new Set<string>();
  if (raw.length > 0) out.add(raw);

  const mx = formatMagasinCodeMx(raw);
  if (mx) out.add(mx);

  const n = parseMagasinNumeric(raw);
  if (n != null) {
    out.add(String(n).padStart(2, "0"));
    out.add(String(n));
  }

  return [...out];
}
