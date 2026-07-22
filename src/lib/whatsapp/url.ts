/** Normalise un numéro mobile marocain / international pour wa.me (chiffres, indicatif 212). */
export function normalizeWhatsAppPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.length < 8) {
    return null;
  }

  if (digits.startsWith("212")) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10 && /^0[67]/.test(digits)) {
    return `212${digits.slice(1)}`;
  }

  if (digits.length === 9 && /^[67]/.test(digits)) {
    return `212${digits}`;
  }

  return digits;
}

/** Lien WhatsApp vers un numéro ; texte optionnel (omis si vide). */
export function buildWhatsAppUrl(phone: string, text = ""): string {
  const normalized = normalizeWhatsAppPhone(phone) ?? phone.replace(/\D/g, "");
  const base = `https://wa.me/${normalized}`;
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return base;
  }
  return `${base}?text=${encodeURIComponent(trimmed)}`;
}

/** Ouvre WhatsApp vers un numéro (sans texte par défaut). */
export function openWhatsAppChat(phone: string, text = ""): Window | null {
  if (typeof window === "undefined") {
    return null;
  }
  const url = buildWhatsAppUrl(phone, text);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
  return opened;
}
