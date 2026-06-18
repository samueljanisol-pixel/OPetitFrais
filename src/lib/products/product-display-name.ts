import type { AppLocale } from "@/i18n/config";

export type ProductNameFields = {
  name: string;
  name_ar?: string | null;
  sales_name?: string | null;
  sales_name_ar?: string | null;
};

/** Nom logistique français. */
export function productLogisticNameFr(product: ProductNameFields): string {
  return product.name;
}

/** Nom logistique arabe (null si vide). */
export function productLogisticNameAr(product: ProductNameFields): string | null {
  const ar = product.name_ar?.trim();
  return ar || null;
}

/** Nom de vente français (repli sur logistique). */
export function productSalesNameFr(product: ProductNameFields): string {
  const sales = product.sales_name?.trim();
  if (sales) return sales;
  return product.name;
}

/** Nom de vente arabe (repli sur logistique arabe). */
export function productSalesNameAr(product: ProductNameFields): string | null {
  const salesAr = product.sales_name_ar?.trim();
  if (salesAr) return salesAr;
  const ar = product.name_ar?.trim();
  return ar || null;
}

/** Nom affiché selon la locale UI (nom vente, repli logistique). */
export function productDisplayName(product: ProductNameFields, locale: AppLocale): string {
  if (locale === "ar-MA") {
    const ar = productSalesNameAr(product);
    if (ar) return ar;
  }
  return productSalesNameFr(product);
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
