import type { CartLine, CatalogProduct } from "@opf/caisse-core";
export type { CatalogCategoryMeta } from "../../shared/catalog-normalize";
export { normalizeCatalogProduct, normalizeCatalogProducts } from "../../shared/catalog-normalize";

export const ALL_SUBCATEGORY = "Tous";
export const ALL_SUBCATEGORY_AR = "الكل";

export type CaisseDisplayLocale = "fr" | "ar";

export function catalogProductDisplayName(
  product: Pick<CatalogProduct, "salesName" | "salesNameAr">,
  locale: CaisseDisplayLocale,
): string {
  if (locale === "ar") {
    const ar = product.salesNameAr?.trim();
    if (ar) return ar;
  }
  return product.salesName;
}

export function buildCatalogDisplayMaps(catalog: readonly CatalogProduct[]): {
  categoryAr: Map<string, string>;
  subcategoryAr: Map<string, string>;
} {
  const categoryAr = new Map<string, string>();
  const subcategoryAr = new Map<string, string>();

  for (const product of catalog) {
    const categoryArLabel = product.categoryLabelAr?.trim();
    if (categoryArLabel) {
      categoryAr.set(product.categoryLabel, categoryArLabel);
    }

    const subcategoryLabel = product.subcategoryLabel?.trim();
    const subcategoryArLabel = product.subcategoryLabelAr?.trim();
    if (subcategoryLabel && subcategoryArLabel) {
      subcategoryAr.set(`${product.categoryLabel}\0${subcategoryLabel}`, subcategoryArLabel);
    }
  }

  return { categoryAr, subcategoryAr };
}

export function catalogCategoryDisplayLabel(
  categoryLabelFr: string,
  locale: CaisseDisplayLocale,
  maps?: { categoryAr: Map<string, string> },
): string {
  if (locale === "fr") return categoryLabelFr;
  return maps?.categoryAr.get(categoryLabelFr) ?? categoryLabelFr;
}

export function catalogSubcategoryDisplayLabel(
  categoryLabelFr: string,
  subcategoryLabelFr: string,
  locale: CaisseDisplayLocale,
  maps?: { subcategoryAr: Map<string, string> },
): string {
  if (subcategoryLabelFr === ALL_SUBCATEGORY) {
    return locale === "ar" ? ALL_SUBCATEGORY_AR : ALL_SUBCATEGORY;
  }
  if (locale === "fr") return subcategoryLabelFr;
  return maps?.subcategoryAr.get(`${categoryLabelFr}\0${subcategoryLabelFr}`) ?? subcategoryLabelFr;
}

export function cartLineDisplayName(
  line: CartLine,
  catalog: readonly CatalogProduct[],
  locale: CaisseDisplayLocale,
): string {
  const product = catalog.find((p) => p.id === line.productId);
  if (product) return catalogProductDisplayName(product, locale);
  return line.productName;
}

export type ProductSortMode = "code" | "alpha";

export function defaultProductSortMode(subcategoryLabel: string): ProductSortMode {
  return subcategoryLabel === ALL_SUBCATEGORY ? "code" : "alpha";
}

function compareProductCodes(a: string, b: string): number {
  const trimA = a.trim();
  const trimB = b.trim();
  if (/^\d+$/.test(trimA) && /^\d+$/.test(trimB)) {
    const numA = Number(trimA);
    const numB = Number(trimB);
    if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  }
  return trimA.localeCompare(trimB, "fr", { numeric: true, sensitivity: "base" });
}

export function sortCatalogProducts(
  products: readonly CatalogProduct[],
  mode: ProductSortMode,
  locale: CaisseDisplayLocale,
): CatalogProduct[] {
  const sorted = [...products];
  if (mode === "code") {
    sorted.sort((a, b) => compareProductCodes(a.code, b.code));
    return sorted;
  }

  const collator = new Intl.Collator(locale === "ar" ? "ar" : "fr", {
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true,
  });
  sorted.sort((a, b) => {
    const byName = collator.compare(
      catalogProductDisplayName(a, locale),
      catalogProductDisplayName(b, locale),
    );
    if (byName !== 0) return byName;
    return compareProductCodes(a.code, b.code);
  });
  return sorted;
}

/** Ordre des onglets caisse : Légume → Fruit → Frigo → Herbes → Epice → Divers. */
const CAISSE_CATEGORY_TAB_RANK: Record<string, number> = {
  legume: 0,
  legumes: 0,
  fruit: 1,
  frigo: 2,
  herbes: 3,
  epice: 4,
  divers: 5,
};

function categoryTabRank(label: string): number {
  const norm = label
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return CAISSE_CATEGORY_TAB_RANK[norm] ?? 1000;
}

export function categoryTabsFromCatalog(catalog: readonly CatalogProduct[]): string[] {
  const seen = new Set<string>();
  for (const p of catalog) {
    if (!p.active) continue;
    const label = p.categoryLabel?.trim();
    if (label) seen.add(label);
  }
  return [...seen].sort((a, b) => {
    const rankDiff = categoryTabRank(a) - categoryTabRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, "fr");
  });
}

export function productsForCategory(
  catalog: readonly CatalogProduct[],
  label: string,
): CatalogProduct[] {
  return catalog.filter((p) => p.active && p.categoryLabel === label);
}

/** Sous-catégories distinctes pour une catégorie (préfixe « Tous » si au moins une). */
export function subcategoryTabsFromCatalog(
  catalog: readonly CatalogProduct[],
  categoryLabel: string,
): string[] {
  const seen = new Map<string, number>();
  for (const p of catalog) {
    if (!p.active || p.categoryLabel !== categoryLabel) continue;
    const label = p.subcategoryLabel?.trim();
    if (!label) continue;
    if (!seen.has(label)) {
      seen.set(label, seen.size);
    }
  }
  if (seen.size === 0) return [];

  const labels = [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  return [ALL_SUBCATEGORY, ...labels];
}

export function productsForCategoryAndSubcategory(
  catalog: readonly CatalogProduct[],
  categoryLabel: string,
  subcategoryLabel: string,
): CatalogProduct[] {
  const inCategory = productsForCategory(catalog, categoryLabel);
  if (subcategoryLabel === ALL_SUBCATEGORY) return inCategory;
  return inCategory.filter((p) => p.subcategoryLabel?.trim() === subcategoryLabel);
}

export function resolveProductByCode(
  catalog: readonly CatalogProduct[],
  code: string,
): CatalogProduct | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  const norm = (s: string) => s.replace(/^0+/, "") || "0";
  return catalog.find((p) => {
    if (!p.active) return false;
    const pc = typeof p.code === "string" ? p.code.trim() : "";
    if (!pc) return false;
    return pc === trimmed || norm(pc) === norm(trimmed);
  });
}

export function activeCatalogProducts(catalog: readonly CatalogProduct[]): CatalogProduct[] {
  return catalog.filter((p) => p.active);
}
