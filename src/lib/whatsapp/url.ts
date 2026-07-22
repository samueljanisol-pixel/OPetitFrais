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

  // Mobile MA local : 06xxxxxxxx ou 07xxxxxxxx (10 chiffres)
  if (digits.startsWith("0") && digits.length === 10 && /^0[67]/.test(digits)) {
    return `212${digits.slice(1)}`;
  }

  // Sans le 0 initial : 6xxxxxxxx / 7xxxxxxxx
  if (digits.length === 9 && /^[67]/.test(digits)) {
    return `212${digits}`;
  }

  return digits;
}

/** Lien WhatsApp avec texte pré-rempli (wa.me). */
export function buildWhatsAppUrl(phone: string, text: string): string {
  const normalized = normalizeWhatsAppPhone(phone) ?? phone.replace(/\D/g, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

/** Ouvre WhatsApp vers un numéro (à appeler de préférence dans le geste clic, avant un await). */
export function openWhatsAppChat(phone: string, text: string): Window | null {
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
