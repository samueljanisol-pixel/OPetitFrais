import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLocale } from "@/i18n/config";
import { compareStrings } from "@/lib/i18n/format";
import { productDisplayName } from "@/lib/products/product-display-name";
import type { CuisineFrigoProduct, CuisineSubcategoryGroup } from "./types";

const FRIGO_PRODUCT_SELECT = `
  id, code, name, name_ar, image_path, subcategory_id,
  ref_subcategory(id, label, sort_order),
  ref_sales_unit(label)
`;

const UNCATEGORIZED_KEY = "__none__";

export async function loadFrigoProducts(
  supabase: SupabaseClient,
  locale: AppLocale,
  uncategorizedLabel: string,
): Promise<{ groups: CuisineSubcategoryGroup[]; error: string | null }> {
  const { data: catData, error: catErr } = await supabase
    .from("ref_category")
    .select("id")
    .eq("code", "frigo")
    .maybeSingle();

  if (catErr) return { groups: [], error: catErr.message };

  const frigoCategoryId = (catData as { id?: string } | null)?.id;
  if (!frigoCategoryId) return { groups: [], error: null };

  const { data, error } = await supabase
    .from("product")
    .select(FRIGO_PRODUCT_SELECT)
    .eq("active", true)
    .eq("category_id", frigoCategoryId)
    .order("name");

  if (error) return { groups: [], error: error.message };

  const products = (data ?? []) as CuisineFrigoProduct[];
  const groupMap = new Map<string, CuisineSubcategoryGroup>();

  for (const p of products) {
    const subRaw = p.ref_subcategory;
    const sub = Array.isArray(subRaw) ? subRaw[0] : subRaw;
    const subcategoryId = sub?.id ?? p.subcategory_id ?? null;
    const key = subcategoryId ?? UNCATEGORIZED_KEY;
    const label = sub?.label?.trim() || uncategorizedLabel;
    const sortOrder = sub?.sort_order ?? 9999;

    let group = groupMap.get(key);
    if (!group) {
      group = { subcategoryId, subcategoryLabel: label, sortOrder, products: [] };
      groupMap.set(key, group);
    }
    group.products.push(p);
  }

  const groups = [...groupMap.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.subcategoryLabel.localeCompare(b.subcategoryLabel, "fr");
  });

  for (const group of groups) {
    group.products.sort((a, b) =>
      compareStrings(locale, productDisplayName(a, locale), productDisplayName(b, locale)),
    );
  }

  return { groups, error: null };
}
