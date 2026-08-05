/** Numéro WhatsApp boutique (NEXT_PUBLIC_SHOP_WHATSAPP_PHONE, sans +). */

export function getShopWhatsAppPhone(): string {
  return (process.env.NEXT_PUBLIC_SHOP_WHATSAPP_PHONE ?? "").trim();
}

/** Préfère le numéro Paramètres (`shop_contact_phone`), sinon la variable d'env. */
export function resolveShopWhatsAppPhone(contactPhoneFromDb?: string | null): string {
  const fromDb = (contactPhoneFromDb ?? "").replace(/\D/g, "");
  if (fromDb.length >= 8) return fromDb;
  return getShopWhatsAppPhone().replace(/\D/g, "");
}

export function isShopWhatsAppConfigured(contactPhoneFromDb?: string | null): boolean {
  return resolveShopWhatsAppPhone(contactPhoneFromDb).length >= 8;
}
