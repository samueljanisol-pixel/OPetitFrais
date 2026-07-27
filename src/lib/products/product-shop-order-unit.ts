import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadProductShopOrderUnitIds(
  supabase: SupabaseClient,
  productId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_shop_order_unit")
    .select("shop_order_unit_id")
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { shop_order_unit_id: string }[])
    .map((r) => r.shop_order_unit_id)
    .filter(Boolean);
}

export async function syncProductShopOrderUnits(
  supabase: SupabaseClient,
  productId: string,
  unitIds: string[],
): Promise<void> {
  const unique = [...new Set(unitIds.filter(Boolean))];
  const { data: existing, error: e0 } = await supabase
    .from("product_shop_order_unit")
    .select("shop_order_unit_id")
    .eq("product_id", productId);
  if (e0) throw new Error(e0.message);

  const current = new Set(
    ((existing ?? []) as { shop_order_unit_id: string }[]).map((r) => r.shop_order_unit_id),
  );
  const next = new Set(unique);

  const toDelete = [...current].filter((id) => !next.has(id));
  const toInsert = [...next].filter((id) => !current.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("product_shop_order_unit")
      .delete()
      .eq("product_id", productId)
      .in("shop_order_unit_id", toDelete);
    if (error) throw new Error(error.message);
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("product_shop_order_unit").insert(
      toInsert.map((shop_order_unit_id) => ({
        product_id: productId,
        shop_order_unit_id,
      })) as never,
    );
    if (error) throw new Error(error.message);
  }
}
