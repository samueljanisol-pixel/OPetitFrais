import type { SupabaseClient } from "@supabase/supabase-js";

type ProductCatalogRow = {
  id: string;
  code: string | null;
  name: string | null;
  category_id: string | null;
  supplier_id: string | null;
  ref_category: { id: string; label: string | null } | Array<{ id: string; label: string | null }> | null;
  ref_supplier: { id: string; label: string | null } | Array<{ id: string; label: string | null }> | null;
  ref_sales_unit: { label: string | null; code: string | null } | Array<{ label: string | null; code: string | null }> | null;
};

function refFromRow(
  raw: { id: string; label: string | null } | Array<{ id: string; label: string | null }> | null,
): { id: string; label: string } | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.id) return null;
  return { id: row.id, label: row.label ?? "—" };
}

/** Code catalogue normalisé (ex. `42` → `000042`). */
export function normalizeProductCode(code: string): string {
  const t = code.trim();
  if (/^\d+$/.test(t)) return t.padStart(6, "0");
  return t.toLowerCase();
}

function salesUnitLabelFromRow(
  raw: { label: string | null; code: string | null } | Array<{ label: string | null; code: string | null }> | null,
): string | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  const label = row?.label?.trim();
  if (label) return label;
  const code = row?.code?.trim();
  return code || null;
}

export type ProductCatalogEntry = {
  productId: string;
  code: string;
  name: string;
  categoryId: string;
  categoryLabel: string;
  supplierId: string;
  supplierLabel: string;
  salesUnitLabel: string | null;
  salesUnitCode: string | null;
};

export type ProductCatalogIndex = {
  byId: Map<string, ProductCatalogEntry>;
  /** Rapprochement strict par code caisse / code article (jamais par nom). */
  resolveByCode(caisseCode: string | null | undefined, articleAsCode?: string | null): ProductCatalogEntry | null;
};

export async function fetchProductCatalogIndex(supabase: SupabaseClient): Promise<ProductCatalogIndex> {
  const { data: productRows, error } = await supabase
    .from("product")
    .select(
      "id, code, name, category_id, supplier_id, ref_category(id, label), ref_supplier(id, label), ref_sales_unit(label, code)",
    );

  const byId = new Map<string, ProductCatalogEntry>();
  const byCode = new Map<string, string>();

  if (!error) {
    for (const row of (productRows ?? []) as ProductCatalogRow[]) {
      if (!row.id || !row.code?.trim()) continue;
      const cat = refFromRow(row.ref_category);
      const sup = refFromRow(row.ref_supplier);
      const categoryId = cat?.id ?? row.category_id;
      const supplierId = sup?.id ?? row.supplier_id;
      if (!categoryId || !supplierId) continue;

      const entry: ProductCatalogEntry = {
        productId: row.id,
        code: row.code.trim(),
        name: (row.name ?? "").trim() || row.code.trim(),
        categoryId,
        categoryLabel: cat?.label ?? "—",
        supplierId,
        supplierLabel: sup?.label ?? "—",
        salesUnitLabel: salesUnitLabelFromRow(row.ref_sales_unit),
        salesUnitCode: (() => {
          const raw = row.ref_sales_unit;
          if (!raw) return null;
          const u = Array.isArray(raw) ? raw[0] : raw;
          const code = u?.code?.trim();
          return code || null;
        })(),
      };

      byId.set(row.id, entry);
      byCode.set(normalizeProductCode(entry.code), row.id);
    }
  }

  const resolveByCode = (
    caisseCode: string | null | undefined,
    articleAsCode?: string | null,
  ): ProductCatalogEntry | null => {
    const candidates: string[] = [];
    const fromCaisse = caisseCode?.trim();
    const fromArticle = articleAsCode?.trim();
    if (fromCaisse) candidates.push(fromCaisse);
    if (fromArticle && fromArticle !== fromCaisse) candidates.push(fromArticle);

    for (const raw of candidates) {
      const productId = byCode.get(normalizeProductCode(raw));
      if (!productId) continue;
      const hit = byId.get(productId);
      if (hit) return hit;
    }

    return null;
  };

  return { byId, resolveByCode };
}

export function catalogEntryForProductId(
  index: ProductCatalogIndex,
  productId: string | null | undefined,
): ProductCatalogEntry | null {
  if (!productId) return null;
  return index.byId.get(productId) ?? null;
}

/** @param caisseCode Code produit dans le JSON caisse (`code`, `Code`, …). */
export function resolveProductIdByCode(
  index: ProductCatalogIndex,
  caisseCode: string | null | undefined,
  articleAsCode?: string | null,
): string | null {
  return index.resolveByCode(caisseCode, articleAsCode)?.productId ?? null;
}

/** @deprecated Utiliser resolveProductIdByCode */
export function resolveProductIdFromArticle(
  index: ProductCatalogIndex,
  article: string,
  caisseCode?: string | null,
): string | null {
  return resolveProductIdByCode(index, caisseCode, article);
}
