export function normalizePosCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(2, "0").slice(-2);
}

export function isTestMagasinCode(code: string): boolean {
  return normalizePosCode(code) === "00";
}

export function codesMatch(left: string, right: string): boolean {
  const a = normalizePosCode(left);
  const b = normalizePosCode(right);
  return a.length > 0 && a === b;
}
