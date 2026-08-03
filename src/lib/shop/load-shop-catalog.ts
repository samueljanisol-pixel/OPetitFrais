import type { AppLocale } from "@/i18n/config";
import { compareProductDisplayNames } from "@/lib/products/product-display-name";
import { refDisplayLabel } from "@/lib/products/ref-display-label";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { normalizeShopRefUnits } from "@/lib/shop/shop-order-options";
import type { ShopCategoryGroup, ShopProduct, ShopSubcategoryGroup } from "@/lib/shop/types";

const SHOP_PRODUCT_SELECT = `
  id, code, name, name_ar, sales_name, sales_name_ar, image_path, price, category_id, subcategory_id,
  piece_weight_kg, shop_allow_sales_unit, shop_favorite_unit_id,
  ref_category(id, code, label, label_ar, sort_order),
  ref_subcategory(id, label, label_ar, sort_order),
  ref_sales_unit(code, label, label_ar),
  product_shop_order_unit(
    shop_order_unit_id,
    ref_shop_order_unit(id, label, label_ar, piece_qty, sort_order)
  )
`;

const UNCategorized_KEY = "__none__";

type RefCategoryRow = {
  id: string;
  code?: string;
  label: string;
  label_ar?: string | null;
  sort_order: number;
};

type RefSubcategoryRow = {
  id: string;
  label: string;
  label_ar?: string | null;
  sort_order: number;
};

type ProductShopUnitLink = {
  shop_order_unit_id?: string;
  ref_shop_order_unit?: unknown;
};

type ProductRow = ShopProduct & {
  ref_category?: RefCategoryRow | RefCategoryRow[] | null;
  ref_subcategory?: RefSubcategoryRow | RefSubcategoryRow[] | null;
  product_shop_order_unit?: ProductShopUnitLink[] | ProductShopUnitLink | null;
};

function normalizeRelation<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function extractShopUnits(raw: ProductRow["product_shop_order_unit"]) {
  const links = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  const units = links.flatMap((link) => {
    const rel = link.ref_shop_order_unit;
    if (rel == null) return [];
    return normalizeShopRefUnits(Array.isArray(rel) ? rel : [rel]);
  });
  return units;
}

function mapProductRow(p: ProductRow): ShopProduct {
  const { ref_category: _c, ref_subcategory: _s, product_shop_order_unit: links, ...rest } = p;
  return {
    ...rest,
    shop_order_units: extractShopUnits(links),
  };
}

function categoryMetaFromRow(
  p: ProductRow,
  locale: AppLocale,
): { id: string; label: string; sortOrder: number } | null {
  const cat = normalizeRelation(p.ref_category);
  if (!cat?.id) return null;
  return {
    id: cat.id,
    label: refDisplayLabel(cat, locale),
    sortOrder: cat.sort_order ?? 9999,
  };
}

export async function loadShopProductsByIds(
  ids: string[],
  locale: AppLocale,
): Promise<{
  products: ShopProduct[];
  categories: Array<{ id: string; label: string; sortOrder: number }>;
  error: string | null;
}> {
  const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return { products: [], categories: [], error: null };
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Configuration Supabase incomplète";
    return { products: [], categories: [], error: msg };
  }

  const { data, error } = await supabase
    .from("product")
    .select(SHOP_PRODUCT_SELECT)
    .in("id", uniqueIds);

  if (error) return { products: [], categories: [], error: error.message };

  const products: ShopProduct[] = [];
  const categoryById = new Map<string, { id: string; label: string; sortOrder: number }>();

  for (const raw of (data ?? []) as ProductRow[]) {
    products.push(mapProductRow(raw));
    const meta = categoryMetaFromRow(raw, locale);
    if (meta) categoryById.set(meta.id, meta);
  }

  return { products, categories: [...categoryById.values()], error: null };
}

export async function loadShopCatalog(
  locale: AppLocale,
  uncategorizedLabel: string,
): Promise<{ groups: ShopCategoryGroup[]; error: string | null }> {
  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Configuration Supabase incomplète";
    return { groups: [], error: msg };
  }

  const { data, error } = await supabase
    .from("product")
    .select(SHOP_PRODUCT_SELECT)
    .eq("active", true)
    .eq("visible_vitrine", true)
    .order("name");

  if (error) return { groups: [], error: error.message };

  const products = (data ?? []) as ProductRow[];
  const categoryMap = new Map<string, ShopCategoryGroup>();

  for (const p of products) {
    const cat = normalizeRelation(p.ref_category);
    if (!cat?.id) continue;

    const sub = normalizeRelation(p.ref_subcategory);
    const subcategoryId = sub?.id ?? p.subcategory_id ?? null;
    const subKey = `${cat.id}:${subcategoryId ?? UNCategorized_KEY}`;

    let categoryGroup = categoryMap.get(cat.id);
    if (!categoryGroup) {
      categoryGroup = {
        categoryId: cat.id,
        categoryLabel: refDisplayLabel(cat, locale),
        sortOrder: cat.sort_order ?? 9999,
        subgroups: [],
      };
      categoryMap.set(cat.id, categoryGroup);
    }

    let subgroup = categoryGroup.subgroups.find(
      (g) => (g.subcategoryId ?? UNCategorized_KEY) === (subcategoryId ?? UNCategorized_KEY),
    );
    if (!subgroup) {
      subgroup = {
        subcategoryId,
        subcategoryLabel: sub ? refDisplayLabel(sub, locale) : uncategorizedLabel,
        sortOrder: sub?.sort_order ?? 9999,
        products: [],
      };
      categoryGroup.subgroups.push(subgroup);
    }

    const product: ShopProduct = mapProductRow(p);
    subgroup.products.push(product);
  }

  const groups = [...categoryMap.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.categoryLabel.localeCompare(b.categoryLabel, locale === "ar-MA" ? "ar" : "fr");
  });

  for (const group of groups) {
    group.subgroups.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.subcategoryLabel.localeCompare(b.subcategoryLabel, locale === "ar-MA" ? "ar" : "fr");
    });
    for (const subgroup of group.subgroups) {
      subgroup.products.sort((a, b) => compareProductDisplayNames(locale, a, b));
    }
  }

  return { groups, error: null };
}
