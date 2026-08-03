import { compareProductDisplayNames } from "@/lib/products/product-display-name";
import type { AppLocale } from "@/i18n/config";
import type { ShopProduct } from "@/lib/shop/types";
import type { ShopCartWorkflowLine } from "@/lib/commandes-client/workflow";

export type CategoryMeta = { label: string; sortOrder: number };

export type WorkflowLineCategoryGroup = {
  categoryId: string;
  categoryLabel: string;
  sortOrder: number;
  items: ShopCartWorkflowLine[];
};

function workflowLineSortKey(line: ShopCartWorkflowLine): string {
  return `${line.productId}__${line.shopOrderUnitId ?? "default"}`;
}

export function groupWorkflowLinesByCategory(
  lines: ShopCartWorkflowLine[],
  productById: Map<string, ShopProduct>,
  categoryMeta: Map<string, CategoryMeta>,
  uncategorizedLabel: string,
  locale: AppLocale,
): WorkflowLineCategoryGroup[] {
  const bucket = new Map<string, WorkflowLineCategoryGroup>();

  for (const line of lines) {
    const product = productById.get(line.productId);
    const categoryId = product?.category_id ?? "__unknown__";
    const meta = product ? categoryMeta.get(product.category_id) : undefined;
    const key = categoryId;

    let group = bucket.get(key);
    if (!group) {
      group = {
        categoryId: key,
        categoryLabel:
          key === "__unknown__" ? uncategorizedLabel : (meta?.label ?? uncategorizedLabel),
        sortOrder: key === "__unknown__" ? 99999 : (meta?.sortOrder ?? 9999),
        items: [],
      };
      bucket.set(key, group);
    }
    group.items.push(line);
  }

  const groups = [...bucket.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.categoryLabel.localeCompare(b.categoryLabel, locale === "ar-MA" ? "ar" : "fr");
  });

  for (const group of groups) {
    group.items.sort((a, b) => {
      const pa = productById.get(a.productId);
      const pb = productById.get(b.productId);
      if (!pa || !pb) return workflowLineSortKey(a).localeCompare(workflowLineSortKey(b));
      return compareProductDisplayNames(locale, pa, pb);
    });
  }

  return groups;
}

export { workflowLineSortKey as commandeWorkflowLineKey };
