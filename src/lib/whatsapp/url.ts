/** Lien WhatsApp avec texte pré-rempli (wa.me). */
export function buildWhatsAppUrl(phone: string, text: string): string {
  const cleaned = phone.replace(/\D/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}
