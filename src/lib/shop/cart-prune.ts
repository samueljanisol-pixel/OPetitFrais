import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopCartLine } from "@/lib/shop/types";

export function pruneCartLinesByProductIds(
  lines: ShopCartLine[],
  availableProductIds: Set<string>,
): ShopCartLine[] {
  return lines.filter((line) => availableProductIds.has(line.productId));
}

export async function fetchShopAvailableProductIds(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(productIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Set();

  const available = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("product")
      .select("id")
      .in("id", chunk)
      .eq("active", true)
      .eq("visible_vitrine", true);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      available.add(String(row.id));
    }
  }
  return available;
}

/** Filtre les lignes pour un panier boutique en cours (pas une commande soumise). */
export async function pruneCartLinesForShopCatalog(
  supabase: SupabaseClient,
  lines: ShopCartLine[],
): Promise<ShopCartLine[]> {
  if (lines.length === 0) return lines;
  const available = await fetchShopAvailableProductIds(
    supabase,
    lines.map((line) => line.productId),
  );
  return pruneCartLinesByProductIds(lines, available);
}

function parseStoredCartLine(raw: unknown): ShopCartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.productId !== "string") return null;
  if (typeof l.qty !== "number" || !Number.isFinite(l.qty)) return null;
  if (typeof l.unitCode !== "string") return null;
  if (typeof l.priceAtAdd !== "number") return null;
  if (typeof l.unitLabel !== "string") return null;
  const shopOrderUnitId =
    l.shopOrderUnitId === null || typeof l.shopOrderUnitId === "string" ? l.shopOrderUnitId : null;
  const equivKgAtAdd =
    l.equivKgAtAdd === null || typeof l.equivKgAtAdd === "number" ? l.equivKgAtAdd : null;
  const canonicalKg =
    l.canonicalKg === null || typeof l.canonicalKg === "number" ? l.canonicalKg : null;
  const comment = typeof l.comment === "string" ? l.comment : undefined;
  return {
    productId: l.productId,
    shopOrderUnitId,
    qty: l.qty,
    unitCode: l.unitCode,
    unitLabel: l.unitLabel,
    priceAtAdd: l.priceAtAdd,
    equivKgAtAdd,
    canonicalKg,
    comment,
  };
}

export function parseStoredCartLines(lines: unknown): ShopCartLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map(parseStoredCartLine).filter((line): line is ShopCartLine => line != null);
}

export function serializeCartLinesForDb(lines: ShopCartLine[]): unknown[] {
  return lines.map((line) => ({
    productId: line.productId,
    shopOrderUnitId: line.shopOrderUnitId,
    qty: line.qty,
    unitCode: line.unitCode,
    unitLabel: line.unitLabel,
    priceAtAdd: line.priceAtAdd,
    equivKgAtAdd: line.equivKgAtAdd,
    canonicalKg: line.canonicalKg ?? null,
    comment: line.comment?.trim() || null,
  }));
}

/** Retire des paniers `active` les lignes des produits indisponibles boutique. */
export async function purgeProductsFromActiveShopCarts(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<{ error: string | null }> {
  const toRemove = new Set(productIds.filter((id) => id.length > 0));
  if (toRemove.size === 0) return { error: null };

  const { data, error } = await supabase.from("shop_cart").select("id, lines").eq("status", "active");
  if (error) return { error: error.message };

  for (const cart of data ?? []) {
    const lines = parseStoredCartLines(cart.lines);
    const pruned = lines.filter((line) => !toRemove.has(line.productId));
    if (pruned.length === lines.length) continue;
    const { error: uErr } = await supabase
      .from("shop_cart")
      .update({ lines: serializeCartLinesForDb(pruned) })
      .eq("id", cart.id);
    if (uErr) return { error: uErr.message };
  }

  return { error: null };
}
