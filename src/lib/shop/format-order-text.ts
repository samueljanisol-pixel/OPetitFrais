import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import { productDisplayName } from "@/lib/products/product-display-name";
import { labelFromRefForLocale } from "@/lib/commandes-fournisseur/product-display";
import { formatShopPriceDh } from "@/lib/shop/format-price";
import type { ShopCartLine, ShopProduct } from "@/lib/shop/types";

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
};

export function buildOrderText(
  lines: ShopCartLine[],
  productById: Map<string, ShopProduct>,
  locale: AppLocale,
  labels: OrderTextLabels,
): string {
  const rows: string[] = [labels.title, labels.separator];
  let total = 0;

  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) continue;
    const name = productDisplayName(product, locale);
    const qtyLabel = formatQtyLabel(line.qty, line.unitCode, locale);
    const lineTotal = line.qty * line.priceAtAdd;
    total += lineTotal;
    const priceStr = formatShopPriceDh(locale, lineTotal);
    rows.push(`${name} — ${qtyLabel} — ${priceStr}`);
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
