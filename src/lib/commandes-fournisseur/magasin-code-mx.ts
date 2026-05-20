/** Libellé court magasin pour export / récap (ex. M01, M12). */
export function magasinCodeMx(code: string | null | undefined, fallbackIndex: number): string {
  const raw = (code ?? "").trim().toUpperCase();
  if (raw.length > 0) {
    if (raw.startsWith("M")) {
      return raw;
    }
    const digits = raw.replace(/\D/g, "");
    if (digits.length > 0) {
      return `M${digits.padStart(2, "0")}`;
    }
    return `M${raw}`;
  }
  return `M${String(fallbackIndex + 1).padStart(2, "0")}`;
}
