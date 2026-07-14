/** Numéro WhatsApp boutique (NEXT_PUBLIC_SHOP_WHATSAPP_PHONE, sans +). */

export function getShopWhatsAppPhone(): string {
  return (process.env.NEXT_PUBLIC_SHOP_WHATSAPP_PHONE ?? "").trim();
}

export function isShopWhatsAppConfigured(): boolean {
  return getShopWhatsAppPhone().replace(/\D/g, "").length >= 8;
}
