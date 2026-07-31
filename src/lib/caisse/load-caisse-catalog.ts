import type { SalesUnitKind } from "@opf/caisse-core";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type CaisseCatalogProduct = {
  id: string;
  code: string;
  salesName: string;
  salesNameAr: string | null;
  price: number;
  salesUnit: SalesUnitKind;
  categoryId: string;
  categoryLabel: string;
  categoryLabelAr: string | null;
  subcategoryId: string | null;
  subcategoryLabel: string | null;
  subcategoryLabelAr: string | null;
  isBio: boolean;
  photoUrl: string | null;
  active: boolean;
};

export type CaisseCatalogCategory = {
  id: string;
  label: string;
  labelAr: string | null;
  sortOrder: number;
};

export type CaisseCatalogPayload = {
  products: CaisseCatalogProduct[];
  categories: CaisseCatalogCategory[];
  fetchedAt: string;
};

const CAISSE_EXCLUDED_CATEGORY_CODES = ["emballages_consommables"] as const;

const CAISSE_PRODUCT_SELECT = `
  id, code, name, name_ar, sales_name, sales_name_ar, price, image_path, active, category_id, subcategory_id,
  ref_category(id, code, label, label_ar, sort_order),
  ref_subcategory(id, label, label_ar),
  ref_sales_unit(code)
`;

type RefCategoryRow = { id: string; code: string; label: string; label_ar?: string | null; sort_order: number };
type RefSubcategoryRow = { id: string; label: string; label_ar?: string | null };
type RefSalesUnitRow = { code: string | null };

type ProductRow = {
  id: string;
  code: string;
  name: string | null;
  name_ar: string | null;
  sales_name: string | null;
  sales_name_ar: string | null;
  price: number | null;
  image_path: string | null;
  active: boolean;
  category_id: string | null;
  subcategory_id: string | null;
  ref_category?: RefCategoryRow | RefCategoryRow[] | null;
  ref_subcategory?: RefSubcategoryRow | RefSubcategoryRow[] | null;
  ref_sales_unit?: RefSalesUnitRow | RefSalesUnitRow[] | null;
};

function normalizeRelation<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function mapSalesUnit(code: string | null | undefined): SalesUnitKind {
  const c = code?.trim().toLowerCase() ?? "";
  if (c === "kg") return "kg";
  return "unit";
}

/** Nom caisse : nom vente si renseigné et ≠ code, sinon nom logistique. */
function caisseProductName(row: Pick<ProductRow, "code" | "name" | "sales_name">): string {
  const code = row.code.trim();
  const sales = row.sales_name?.trim();
  if (sales && sales !== code) return sales;
  const logistic = row.name?.trim();
  if (logistic) return logistic;
  return sales ?? code;
}

function caisseProductNameAr(
  row: Pick<ProductRow, "name_ar" | "sales_name_ar">,
): string | null {
  const salesAr = row.sales_name_ar?.trim();
  if (salesAr) return salesAr;
  const nameAr = row.name_ar?.trim();
  return nameAr || null;
}

function refLabelAr(raw: string | null | undefined): string | null {
  const ar = raw?.trim();
  return ar ? ar : null;
}

function detectBio(subLabel: string | null, salesName: string): boolean {
  const sub = subLabel?.toUpperCase() ?? "";
  if (sub.includes("BIO")) return true;
  return salesName.trim().toUpperCase().startsWith("BIO ");
}

function isExcludedCaisseCategory(cat: RefCategoryRow): boolean {
  const code = cat.code?.trim().toLowerCase() ?? "";
  return (CAISSE_EXCLUDED_CATEGORY_CODES as readonly string[]).includes(code);
}

export async function loadCaisseCatalog(): Promise<{
  payload: CaisseCatalogPayload | null;
  error: string | null;
}> {
  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Configuration Supabase incomplète";
    return { payload: null, error: msg };
  }

  const { data, error } = await supabase
    .from("product")
    .select(CAISSE_PRODUCT_SELECT)
    .eq("active", true)
    .order("sales_name");

  if (error) return { payload: null, error: error.message };

  const rows = (data ?? []) as ProductRow[];
  const categoryMap = new Map<string, CaisseCatalogCategory>();
  const products: CaisseCatalogProduct[] = [];

  for (const row of rows) {
    if (!row.active) continue;
    const cat = normalizeRelation(row.ref_category);
    if (!cat?.id) continue;
    if (isExcludedCaisseCategory(cat)) continue;

    const sub = normalizeRelation(row.ref_subcategory);
    const salesUnitRow = normalizeRelation(row.ref_sales_unit);
    const salesName = caisseProductName(row);
    const subLabel = sub?.label ?? null;

    if (!categoryMap.has(cat.id)) {
      categoryMap.set(cat.id, {
        id: cat.id,
        label: cat.label,
        labelAr: refLabelAr(cat.label_ar),
        sortOrder: cat.sort_order ?? 9999,
      });
    }

    products.push({
      id: row.id,
      code: row.code.trim(),
      salesName,
      salesNameAr: caisseProductNameAr(row),
      price: typeof row.price === "number" ? row.price : 0,
      salesUnit: mapSalesUnit(salesUnitRow?.code),
      categoryId: cat.id,
      categoryLabel: cat.label,
      categoryLabelAr: refLabelAr(cat.label_ar),
      subcategoryId: sub?.id ?? row.subcategory_id,
      subcategoryLabel: subLabel,
      subcategoryLabelAr: sub ? refLabelAr(sub.label_ar) : null,
      isBio: detectBio(subLabel, salesName),
      photoUrl: productPhotoPublicUrl(supabase, row.image_path),
      active: row.active,
    });
  }

  const categories = [...categoryMap.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label, "fr");
  });

  return {
    payload: {
      products,
      categories,
      fetchedAt: new Date().toISOString(),
    },
    error: null,
  };
}
