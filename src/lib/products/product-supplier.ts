import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_SUPPLIER_PRODUCT_EMBED } from "@/lib/products/product-supabase-select";

/** Ids fournisseurs liés au produit (product_supplier), repli sur product.supplier_id si vide. */
export async function loadProductSupplierIds(
  supabase: SupabaseClient,
  productId: string,
  fallbackSupplierId?: string | null,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_supplier")
    .select("supplier_id")
    .eq("product_id", productId);
  if (error) {
    throw new Error(error.message);
  }
  const ids = (data ?? [])
    .map((r) => (r as { supplier_id?: string }).supplier_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length > 0) {
    return [...new Set(ids)];
  }
  const fb = typeof fallbackSupplierId === "string" ? fallbackSupplierId.trim() : "";
  return fb.length > 0 ? [fb] : [];
}

/** Produit rattaché au fournisseur (principal ou product_supplier). */
export async function productBelongsToSupplier(
  supabase: SupabaseClient,
  productId: string,
  supplierId: string,
): Promise<boolean> {
  const sid = supplierId.trim();
  if (!sid) return false;

  const { data: product, error: pe } = await supabase
    .from("product")
    .select("supplier_id")
    .eq("id", productId)
    .maybeSingle();
  if (pe) {
    throw new Error(pe.message);
  }
  if (!product) return false;
  if ((product as { supplier_id?: string }).supplier_id === sid) return true;

  const { data: link, error: le } = await supabase
    .from("product_supplier")
    .select("supplier_id")
    .eq("product_id", productId)
    .eq("supplier_id", sid)
    .maybeSingle();
  if (le) {
    throw new Error(le.message);
  }
  return link != null;
}

/** Produits actifs liés au fournisseur via product_supplier. */
export async function productIdsLinkedViaProductSupplier(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_supplier")
    .select(`product_id, ${PRODUCT_SUPPLIER_PRODUCT_EMBED}(id, active)`)
    .eq("supplier_id", supplierId)
    .eq("product.active", true);
  if (error) {
    throw new Error(error.message);
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const pid = (row as { product_id?: string }).product_id;
    if (pid) ids.add(pid);
  }
  return [...ids];
}

/**
 * Fournisseur principal : premier id coché selon l’ordre référentiel (sort_order, label).
 */
export function primarySupplierIdFromSelection(
  supplierIds: Iterable<string>,
  suppliersOrdered: Array<{ id: string }>,
): string | null {
  const set = new Set(supplierIds);
  for (const s of suppliersOrdered) {
    if (set.has(s.id)) return s.id;
  }
  const first = set.values().next().value;
  return typeof first === "string" && first.length > 0 ? first : null;
}

/** Remplace les liaisons product_supplier ; retourne le fournisseur principal choisi. */
export async function syncProductSuppliers(
  supabase: SupabaseClient,
  productId: string,
  supplierIds: string[],
  suppliersOrdered: Array<{ id: string }>,
): Promise<string | null> {
  const unique = [...new Set(supplierIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (unique.length === 0) {
    return null;
  }

  const { error: delErr } = await supabase.from("product_supplier").delete().eq("product_id", productId);
  if (delErr) {
    throw new Error(delErr.message);
  }

  const { error: insErr } = await supabase.from("product_supplier").insert(
    unique.map((supplier_id) => ({ product_id: productId, supplier_id })) as never,
  );
  if (insErr) {
    throw new Error(insErr.message);
  }

  return primarySupplierIdFromSelection(unique, suppliersOrdered);
}

/** Produits actifs rattachés au fournisseur (principal ou product_supplier). */
export async function activeProductIdsForSupplier(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<string[]> {
  const sid = supplierId.trim();
  if (!sid) return [];

  const ids = new Set<string>();
  const { data: byPrimary, error: e1 } = await supabase
    .from("product")
    .select("id")
    .eq("active", true)
    .eq("supplier_id", sid);
  if (e1) {
    throw new Error(e1.message);
  }
  for (const row of byPrimary ?? []) {
    const id = (row as { id?: string }).id;
    if (id) ids.add(id);
  }
  for (const id of await productIdsLinkedViaProductSupplier(supabase, sid)) {
    ids.add(id);
  }
  return [...ids];
}
