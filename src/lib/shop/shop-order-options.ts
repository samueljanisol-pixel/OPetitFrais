import type { AppLocale } from "@/i18n/config";
import { salesUnitCode, stepForUnit } from "@/lib/shop/cart-qty";
import type { ShopOrderOption, ShopProduct, ShopRefOrderUnit } from "@/lib/shop/types";

export function shopOptionKey(shopOrderUnitId: string | null): string {
  return shopOrderUnitId ?? "__udv__";
}

function salesUnitLabels(product: ShopProduct): { label: string; labelAr: string | null } {
  const raw = product.ref_sales_unit;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return {
    label: row?.label?.trim() || "UdV",
    labelAr: row?.label_ar?.trim() ? row.label_ar.trim() : null,
  };
}

export function resolveShopOrderOptions(product: ShopProduct): ShopOrderOption[] {
  const options: ShopOrderOption[] = [];
  const allowUdv = product.shop_allow_sales_unit !== false;
  const unitCode = salesUnitCode(product.ref_sales_unit);
  const { label: udvLabel, labelAr: udvLabelAr } = salesUnitLabels(product);

  if (allowUdv) {
    options.push({
      shopOrderUnitId: null,
      label: udvLabel,
      labelAr: udvLabelAr,
      unitCode,
      unitPrice: Number(product.price) || 0,
      equivKg: unitCode === "kg" ? 1 : null,
      isEstimated: false,
      qtyStep: stepForUnit(unitCode),
    });
  }

  const pieceWeight =
    product.piece_weight_kg != null && Number(product.piece_weight_kg) > 0
      ? Number(product.piece_weight_kg)
      : null;
  const units = product.shop_order_units ?? [];
  for (const u of units) {
    const qty = Number(u.piece_qty);
    if (!(qty > 0)) continue;
    const equivKg = pieceWeight != null ? qty * pieceWeight : null;
    const pricePerKg = Number(product.price) || 0;
    const unitPrice =
      equivKg != null
        ? Math.round(equivKg * pricePerKg * 100) / 100
        : pricePerKg;
    options.push({
      shopOrderUnitId: u.id,
      label: u.label,
      labelAr: u.label_ar ?? null,
      unitCode: "unite",
      unitPrice,
      equivKg,
      isEstimated: equivKg != null,
      qtyStep: 1,
    });
  }

  return options;
}

export function favoriteShopOrderUnitId(product: ShopProduct): string | null {
  const options = resolveShopOrderOptions(product);
  if (options.length === 0) return null;
  const favId = product.shop_favorite_unit_id ?? null;
  if (favId != null && options.some((o) => o.shopOrderUnitId === favId)) {
    return favId;
  }
  if (options.some((o) => o.shopOrderUnitId === null)) {
    return null;
  }
  return options[0]?.shopOrderUnitId ?? null;
}

export function findShopOption(
  product: ShopProduct,
  shopOrderUnitId: string | null,
): ShopOrderOption | null {
  return (
    resolveShopOrderOptions(product).find((o) => o.shopOrderUnitId === shopOrderUnitId) ?? null
  );
}

export function shopOptionLabel(option: ShopOrderOption, locale: AppLocale): string {
  if (locale === "ar-MA" && option.labelAr?.trim()) return option.labelAr.trim();
  return option.label;
}

export function normalizeShopRefUnits(raw: unknown): ShopRefOrderUnit[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopRefOrderUnit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : null;
    const label = typeof r.label === "string" ? r.label : null;
    const pieceQty = typeof r.piece_qty === "number" ? r.piece_qty : Number(r.piece_qty);
    if (!id || !label || !(pieceQty > 0)) continue;
    out.push({
      id,
      label,
      label_ar: typeof r.label_ar === "string" ? r.label_ar : null,
      piece_qty: pieceQty,
      sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    });
  }
  return out.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "fr"));
}
