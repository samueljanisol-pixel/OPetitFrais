import { compareProductDisplayNames } from "@/lib/products/product-display-name";
import type { AppLocale } from "@/i18n/config";
import type { ShopCartLine, ShopCategoryGroup, ShopProduct } from "@/lib/shop/types";

export type CartCategoryGroup = {
  categoryId: string;
  categoryLabel: string;
  sortOrder: number;
  lines: ShopCartLine[];
};

export function buildCategoryMeta(
  groups: ShopCategoryGroup[],
): Map<string, { label: string; sortOrder: number }> {
  const map = new Map<string, { label: string; sortOrder: number }>();
  for (const group of groups) {
    map.set(group.categoryId, { label: group.categoryLabel, sortOrder: group.sortOrder });
  }
  return map;
}

export function groupCartLinesByCategory(
  lines: ShopCartLine[],
  productById: Map<string, ShopProduct>,
  categoryMeta: Map<string, { label: string; sortOrder: number }>,
  uncategorizedLabel: string,
  locale: AppLocale,
): CartCategoryGroup[] {
  const bucket = new Map<string, CartCategoryGroup>();

  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) continue;

    const categoryId = product.category_id;
    const meta = categoryMeta.get(categoryId);
    const key = categoryId || "__none__";

    let group = bucket.get(key);
    if (!group) {
      group = {
        categoryId: key,
        categoryLabel: meta?.label ?? uncategorizedLabel,
        sortOrder: meta?.sortOrder ?? 9999,
        lines: [],
      };
      bucket.set(key, group);
    }
    group.lines.push(line);
  }

  const groups = [...bucket.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.categoryLabel.localeCompare(b.categoryLabel, locale === "ar-MA" ? "ar" : "fr");
  });

  for (const group of groups) {
    group.lines.sort((a, b) => {
      const pa = productById.get(a.productId);
      const pb = productById.get(b.productId);
      if (!pa || !pb) return 0;
      return compareProductDisplayNames(locale, pa, pb);
    });
  }

  return groups;
}
