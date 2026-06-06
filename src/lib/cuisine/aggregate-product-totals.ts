import type {
  CuisineFrigoProduct,
  CuisineJournalEntryWithProduct,
  CuisineProductDayTotal,
  CuisineSubcategoryTotalsGroup,
} from "./types";
import { normalizeProductRelation } from "./normalize-product-relation";

function normalizeSubcategory(
  raw: CuisineFrigoProduct["ref_subcategory"],
): { id: string; label: string; sort_order: number } | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.id) return null;
  return row;
}

function salesUnitLabel(raw: CuisineFrigoProduct["ref_sales_unit"]): string {
  if (!raw) return "";
  const row = Array.isArray(raw) ? raw[0] : raw;
  return typeof row?.label === "string" ? row.label : "";
}

export function aggregateProductTotalsBySubcategory(
  entries: CuisineJournalEntryWithProduct[],
  uncategorizedLabel: string,
): CuisineSubcategoryTotalsGroup[] {
  const byProduct = new Map<
    string,
    CuisineProductDayTotal & { subcategoryId: string | null; subcategoryLabel: string; subcategorySortOrder: number }
  >();

  for (const entry of entries) {
    const product = normalizeProductRelation(entry.product);
    if (!product) continue;

    const q = Number(entry.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;

    const sub = normalizeSubcategory(product.ref_subcategory);
    const subcategoryId = sub?.id ?? product.subcategory_id ?? null;
    const subcategoryLabel = sub?.label ?? uncategorizedLabel;
    const subcategorySortOrder = sub?.sort_order ?? 9999;

    let row = byProduct.get(product.id);
    if (!row) {
      row = {
        productId: product.id,
        code: product.code,
        name: product.name,
        name_ar: product.name_ar,
        unit: salesUnitLabel(product.ref_sales_unit),
        entrees: 0,
        sorties: 0,
        subcategoryId,
        subcategoryLabel,
        subcategorySortOrder,
      };
      byProduct.set(product.id, row);
    }

    if (entry.entry_type === "entree") row.entrees += q;
    else if (entry.entry_type === "sortie") row.sorties += q;
  }

  const bySubcategory = new Map<string, CuisineSubcategoryTotalsGroup>();

  for (const row of byProduct.values()) {
    if (row.entrees <= 0 && row.sorties <= 0) continue;

    const key = row.subcategoryId ?? "__none__";
    let group = bySubcategory.get(key);
    if (!group) {
      group = {
        subcategoryId: row.subcategoryId,
        subcategoryLabel: row.subcategoryLabel,
        sortOrder: row.subcategorySortOrder,
        products: [],
      };
      bySubcategory.set(key, group);
    }

    group.products.push({
      productId: row.productId,
      code: row.code,
      name: row.name,
      name_ar: row.name_ar,
      unit: row.unit,
      entrees: row.entrees,
      sorties: row.sorties,
    });
  }

  const groups = [...bySubcategory.values()];
  for (const group of groups) {
    group.products.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }
  groups.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.subcategoryLabel.localeCompare(b.subcategoryLabel, "fr", { sensitivity: "base" });
  });

  return groups;
}
