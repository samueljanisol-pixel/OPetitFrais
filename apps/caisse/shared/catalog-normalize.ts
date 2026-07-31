import type { CatalogProduct, SalesUnitKind } from "@opf/caisse-core";

export type CatalogCategoryMeta = {
  id: string;
  label: string;
  labelAr: string | null;
  sortOrder: number;
};

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const nameRaw = typeof p.name === "string" ? p.name.trim() : "";
  const salesName =
    salesNameRaw && salesNameRaw !== code
      ? salesNameRaw
      : nameRaw || salesNameRaw || code;
  if (!id || !code || !salesName) return null;

  const salesNameAr =
    optionalTrimmedString(p.salesNameAr) ??
    optionalTrimmedString(p.sales_name_ar) ??
    optionalTrimmedString(p.name_ar);

  const salesUnit: SalesUnitKind = p.salesUnit === "unit" ? "unit" : "kg";
  const categoryLabel =
    typeof p.categoryLabel === "string" && p.categoryLabel.trim().length > 0
      ? p.categoryLabel.trim()
      : "Divers";
  const categoryId = typeof p.categoryId === "string" ? p.categoryId : categoryLabel;
  const categoryLabelAr =
    optionalTrimmedString(p.categoryLabelAr) ?? optionalTrimmedString(p.category_label_ar);

  return {
    id,
    code,
    salesName,
    salesNameAr,
    price: typeof p.price === "number" && Number.isFinite(p.price) ? p.price : 0,
    salesUnit,
    categoryId,
    categoryLabel,
    categoryLabelAr,
    subcategoryId: typeof p.subcategoryId === "string" ? p.subcategoryId : null,
    subcategoryLabel:
      typeof p.subcategoryLabel === "string" ? p.subcategoryLabel : null,
    subcategoryLabelAr:
      optionalTrimmedString(p.subcategoryLabelAr) ?? optionalTrimmedString(p.subcategory_label_ar),
    isBio: p.isBio === true,
    photoUrl: typeof p.photoUrl === "string" ? p.photoUrl : null,
    active: p.active !== false,
  };
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

export function normalizeCategoryMeta(raw: unknown): CatalogCategoryMeta[] {
  if (!Array.isArray(raw)) return [];
  const items: CatalogCategoryMeta[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!id || !label) continue;
    const labelArRaw =
      typeof row.labelAr === "string"
        ? row.labelAr.trim()
        : typeof row.label_ar === "string"
          ? row.label_ar.trim()
          : "";
    items.push({
      id,
      label,
      labelAr: labelArRaw.length > 0 ? labelArRaw : null,
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 9999,
    });
  }
  return items;
}

export function countCatalogArabicLabels(catalog: readonly CatalogProduct[]): {
  products: number;
  categories: number;
} {
  let products = 0;
  let categories = 0;
  const seenCategories = new Set<string>();

  for (const product of catalog) {
    if (product.salesNameAr?.trim()) products += 1;
    if (product.categoryLabelAr?.trim() && !seenCategories.has(product.categoryLabel)) {
      seenCategories.add(product.categoryLabel);
      categories += 1;
    }
  }

  return { products, categories };
}
