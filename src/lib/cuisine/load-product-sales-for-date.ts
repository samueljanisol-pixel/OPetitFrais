import type { SupabaseClient } from "@supabase/supabase-js";
import type { CuisineSubcategoryTotalsGroup } from "./types";

type CaProductDayRow = {
  product_id: string | null;
  qty: number | string;
};

/** Quantités vendues du jour (`ca_product_day`), agrégées par `product_id` (tous magasins). */
export async function loadProductSalesQtyForDate(
  supabase: SupabaseClient,
  date: string,
): Promise<{ byProductId: Map<string, number>; error: string | null }> {
  const { data, error } = await supabase
    .from("ca_product_day")
    .select("product_id, qty")
    .eq("date", date)
    .not("product_id", "is", null);

  if (error) return { byProductId: new Map(), error: error.message };

  const byProductId = new Map<string, number>();
  for (const row of (data ?? []) as CaProductDayRow[]) {
    const productId = row.product_id;
    if (!productId) continue;
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    byProductId.set(productId, (byProductId.get(productId) ?? 0) + qty);
  }

  return { byProductId, error: null };
}

export function mergeProductGroupsWithSales(
  groups: CuisineSubcategoryTotalsGroup[],
  salesByProductId: Map<string, number>,
): CuisineSubcategoryTotalsGroup[] {
  return groups.map((group) => ({
    ...group,
    products: group.products.map((product) => ({
      ...product,
      ventes: salesByProductId.get(product.productId) ?? 0,
    })),
  }));
}
