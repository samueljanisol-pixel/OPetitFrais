import type { CatalogProduct, SalesUnitKind } from "@opf/caisse-core";

export const ALL_SUBCATEGORY = "Tous";

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

export function normalizeCatalogProduct(raw: unknown): CatalogProduct | null {
  if (raw == null || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "string" ? p.id : "";
  const code = typeof p.code === "string" ? p.code.trim() : "";
  const salesNameRaw =
    typeof p.salesName === "string"
      ? p.salesName.trim()
      : typeof p.sales_name === "string"
        ? p.sales_name.trim()
        : "";
  const nameRaw =
    typeof p.name === "string" ? p.name.trim() : "";
  const salesName =
    salesNameRaw && salesNameRaw !== code
      ? salesNameRaw
      : nameRaw || salesNameRaw || code;
  if (!id || !code || !salesName) return null;

  const salesUnit: SalesUnitKind = p.salesUnit === "unit" ? "unit" : "kg";
  const categoryLabel =
    typeof p.categoryLabel === "string" && p.categoryLabel.trim().length > 0
      ? p.categoryLabel.trim()
      : "Divers";
  const categoryId = typeof p.categoryId === "string" ? p.categoryId : categoryLabel;

  return {
    id,
    code,
    salesName,
    price: typeof p.price === "number" && Number.isFinite(p.price) ? p.price : 0,
    salesUnit,
    categoryId,
    categoryLabel,
    subcategoryId: typeof p.subcategoryId === "string" ? p.subcategoryId : null,
    subcategoryLabel:
      typeof p.subcategoryLabel === "string" ? p.subcategoryLabel : null,
    isBio: p.isBio === true,
    photoUrl: typeof p.photoUrl === "string" ? p.photoUrl : null,
    active: p.active === true,
  };
}

export function activeCatalogProducts(catalog: readonly CatalogProduct[]): CatalogProduct[] {
  return catalog.filter((p) => p.active);
}

export function normalizeCatalogProducts(raw: unknown): CatalogProduct[] {
  if (!Array.isArray(raw)) return [];
  const items: CatalogProduct[] = [];
  for (const entry of raw) {
    const product = normalizeCatalogProduct(entry);
    if (product?.active) items.push(product);
  }
  return items;
}
