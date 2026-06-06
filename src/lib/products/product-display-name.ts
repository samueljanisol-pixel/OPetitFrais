import type { AppLocale } from "@/i18n/config";

export type ProductNameFields = {
  name: string;
  name_ar?: string | null;
};

/** Nom affiché selon la locale UI (arabe si dispo, sinon français). */
export function productDisplayName(product: ProductNameFields, locale: AppLocale): string {
  if (locale === "ar-MA") {
    const ar = product.name_ar?.trim();
    if (ar) return ar;
  }
  return product.name;
}
