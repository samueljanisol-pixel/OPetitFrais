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

const productNameCollator = (locale: AppLocale) =>
  new Intl.Collator(locale === "ar-MA" ? "ar" : "fr", {
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true,
  });

/** Tri alphabétique des produits selon le nom affiché (locale UI). */
export function compareProductDisplayNames(
  locale: AppLocale,
  a: ProductNameFields,
  b: ProductNameFields,
): number {
  const collator = productNameCollator(locale);
  const byDisplay = collator.compare(productDisplayName(a, locale), productDisplayName(b, locale));
  if (byDisplay !== 0) return byDisplay;
  return collator.compare(a.name, b.name);
}
