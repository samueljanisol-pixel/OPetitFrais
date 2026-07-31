import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import { productDisplayName } from "@/lib/products/product-display-name";
import { formatShopKgEstimate, formatShopPriceDh } from "@/lib/shop/format-price";
import { groupCartLinesByCategory } from "@/lib/shop/group-cart-by-category";
import type { ShopCartLine, ShopProduct } from "@/lib/shop/types";

export type OrderTextLine = {
  name: string;
  qtyLabel: string;
  lineTotal: number;
};

function formatQtyLabel(line: ShopCartLine, locale: AppLocale): string {
  const formatted = formatNumber(locale, line.qty, {
    minimumFractionDigits: line.unitCode === "kg" ? 1 : 0,
    maximumFractionDigits: line.unitCode === "kg" ? 2 : 0,
  });
  const unit = line.unitLabel.trim() || (line.unitCode === "kg" ? "kg" : "unité");
  let label = `${formatted} × ${unit}`;
  if (line.equivKgAtAdd != null && line.equivKgAtAdd > 0 && line.shopOrderUnitId != null) {
    const totalKg = line.qty * line.equivKgAtAdd;
    const soit = locale === "ar-MA" ? "أي" : "soit";
    label += ` (${soit} ${formatShopKgEstimate(locale, totalKg)})`;
  }
  return label;
}

export type OrderTextLabels = {
  title: string;
  total: string;
  separator: string;
  uncategorized?: string;
  fulfillment?: string | null;
  payment?: string | null;
  /** Libellé « Commentaire : » dans le message exporté. */
  commentLabel?: string;
  comment?: string | null;
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
    qtyLabel: formatQtyLabel(line, locale),
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
  const rows: string[] = [labels.title];
  if (labels.fulfillment?.trim()) {
    rows.push(labels.fulfillment.trim());
  }
  rows.push(labels.separator);
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
  rows.push(`${labels.total} : ${formatShopPriceDh(locale, total, true)}`);
  if (labels.payment?.trim()) {
    rows.push(labels.payment.trim());
  }
  const comment = labels.comment?.trim();
  if (comment) {
    const prefix = labels.commentLabel?.trim();
    rows.push(prefix ? `${prefix}: ${comment}` : comment);
  }
  return rows.join("\n");
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const cleaned = phone.replace(/\D/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}
