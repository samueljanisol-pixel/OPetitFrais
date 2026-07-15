import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import { productDisplayName } from "@/lib/products/product-display-name";
import { labelFromRefForLocale } from "@/lib/commandes-fournisseur/product-display";
import { formatShopPriceDh } from "@/lib/shop/format-price";
import { groupCartLinesByCategory } from "@/lib/shop/group-cart-by-category";
import type { ShopCartLine, ShopProduct } from "@/lib/shop/types";

export type OrderTextLine = {
  name: string;
  qtyLabel: string;
  lineTotal: number;
};

function formatQtyLabel(qty: number, unitCode: string, locale: AppLocale): string {
  const formatted = formatNumber(locale, qty, {
    minimumFractionDigits: unitCode === "kg" ? 1 : 0,
    maximumFractionDigits: unitCode === "kg" ? 2 : 0,
  });
  if (unitCode === "kg") {
    return locale === "ar-MA" ? `${formatted} كغ` : `${formatted} kg`;
  }
  if (qty <= 1) {
    return locale === "ar-MA" ? `${formatted} وحدة` : `${formatted} unité`;
  }
  return locale === "ar-MA" ? `${formatted} وحدات` : `${formatted} unités`;
}

export type OrderTextLabels = {
  title: string;
  total: string;
  separator: string;
  uncategorized?: string;
};

export type OrderTextCategoryMeta = Map<string, { label: string; sortOrder: number }>;

function toOrderTextLine(
  line: ShopCartLine,
  productById: Map<string, ShopProduct>,
  locale: AppLocale,
): OrderTextLine | null {
  const product = productById.get(line.productId);
  if (!product) return null;
  return {
    name: productDisplayName(product, locale),
    qtyLabel: formatQtyLabel(line.qty, line.unitCode, locale),
    lineTotal: line.qty * line.priceAtAdd,
  };
}

/** Aligne les quantités avec des espaces fixes (même colonne pour toutes les lignes du bloc). */
export function formatLinesWithFixedSpacing(
  lines: Pick<OrderTextLine, "name" | "qtyLabel">[],
): string[] {
  if (lines.length === 0) return [];
  const nameWidth = Math.max(...lines.map((l) => l.name.length));
  const gapAfterName = 2;

  return lines.map(({ name, qtyLabel }) => `${name.padEnd(nameWidth + gapAfterName, " ")}${qtyLabel}`);
}

export function buildOrderText(
  lines: ShopCartLine[],
  productById: Map<string, ShopProduct>,
  locale: AppLocale,
  labels: OrderTextLabels,
  categoryMeta?: OrderTextCategoryMeta,
): string {
  const rows: string[] = [labels.title, labels.separator];
  let total = 0;

  if (categoryMeta && categoryMeta.size > 0) {
    const groups = groupCartLinesByCategory(
      lines,
      productById,
      categoryMeta,
      labels.uncategorized ?? "Autres",
      locale,
    );
    for (const group of groups) {
      rows.push(group.categoryLabel);
      const entries = group.lines.flatMap((line) => {
        const entry = toOrderTextLine(line, productById, locale);
        return entry ? [entry] : [];
      });
      for (const entry of entries) {
        total += entry.lineTotal;
      }
      rows.push(...formatLinesWithFixedSpacing(entries));
      rows.push("");
    }
    if (rows[rows.length - 1] === "") rows.pop();
  } else {
    const entries = lines.flatMap((line) => {
      const entry = toOrderTextLine(line, productById, locale);
      return entry ? [entry] : [];
    });
    for (const entry of entries) {
      total += entry.lineTotal;
    }
    rows.push(...formatLinesWithFixedSpacing(entries));
  }

  rows.push(labels.separator);
  rows.push(`${labels.total} : ${formatShopPriceDh(locale, total)}`);
  return rows.join("\n");
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const cleaned = phone.replace(/\D/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

export function productUnitLabel(product: ShopProduct, locale: AppLocale): string {
  return labelFromRefForLocale(product.ref_sales_unit, locale);
}
