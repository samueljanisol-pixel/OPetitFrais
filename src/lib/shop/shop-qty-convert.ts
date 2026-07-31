import { roundQtyForUnit } from "@/lib/shop/cart-qty";
import { findShopOption } from "@/lib/shop/shop-order-options";
import type { ShopCartLine, ShopOrderOption, ShopProduct } from "@/lib/shop/types";

/** Masse de référence (kg) d'une ligne panier — source de vérité pour les changements d'unité. */
export function resolveLineCanonicalKg(line: ShopCartLine, product: ShopProduct): number {
  if (line.canonicalKg != null && line.canonicalKg > 0) {
    return line.canonicalKg;
  }
  const option = findShopOption(product, line.shopOrderUnitId);
  if (option?.unitCode === "kg") {
    return line.qty;
  }
  if (line.equivKgAtAdd != null && line.equivKgAtAdd > 0) {
    return line.qty * line.equivKgAtAdd;
  }
  if (option?.equivKg != null && option.equivKg > 0) {
    return line.qty * option.equivKg;
  }
  return line.qty;
}

export function canonicalKgFromQty(qty: number, option: ShopOrderOption | null): number | null {
  if (qty <= 0 || !option) return null;
  if (option.unitCode === "kg") return qty;
  if (option.equivKg != null && option.equivKg > 0) return qty * option.equivKg;
  return null;
}

/** Convertit une masse kg vers la quantité affichée / commandée pour l'option cible. */
export function convertCanonicalKgToQty(canonicalKg: number, option: ShopOrderOption): number {
  if (canonicalKg <= 0) return 0;
  if (option.unitCode === "kg") {
    return roundQtyForUnit(canonicalKg, "kg");
  }
  if (option.equivKg != null && option.equivKg > 0) {
    const pieces = canonicalKg / option.equivKg;
    const rounded = Math.round(pieces);
    return rounded > 0 ? rounded : 1;
  }
  return Math.max(0, Math.round(canonicalKg));
}

export function convertLineQtyToOption(
  line: ShopCartLine,
  product: ShopProduct,
  targetOption: ShopOrderOption,
): number {
  return convertCanonicalKgToQty(resolveLineCanonicalKg(line, product), targetOption);
}
