import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeProductLinesByMagasin } from "@/lib/ca/benefitFromSales";
import type { CuisineSubcategoryTotalsGroup } from "./types";

type CaProductDayRow = {
  product_id: string | null;
  magasin: string;
  qty: number | string;
};

export type CuisineProductSalesForDate = {
  byProductId: Map<string, number>;
  byProductIdAndMagasin: Map<string, Map<string, number>>;
  magasinsInData: string[];
};

/** Code magasin canonique pour jointure (`M01` → `M1`, aligné sur `ca_product_day`). */
export function canonicalMagasinCode(code: string): string {
  const raw = code.trim().toUpperCase();
  const m = raw.match(/^M0*(\d+)$/);
  if (m) return `M${m[1]}`;
  return raw;
}

function compareMagasinCodes(a: string, b: string): number {
  const na = Number(a.replace(/^M/i, ""));
  const nb = Number(b.replace(/^M/i, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "fr", { sensitivity: "base" });
}

/** Quantités vendues du jour (`ca_product_day`), par produit et par magasin. */
export async function loadProductSalesQtyForDate(
  supabase: SupabaseClient,
  date: string,
): Promise<{ sales: CuisineProductSalesForDate; error: string | null }> {
  const empty: CuisineProductSalesForDate = {
    byProductId: new Map(),
    byProductIdAndMagasin: new Map(),
    magasinsInData: [],
  };

  const { data, error } = await supabase
    .from("ca_product_day")
    .select("product_id, magasin, qty")
    .eq("date", date)
    .not("product_id", "is", null);

  if (error) return { sales: empty, error: error.message };

  const rows = dedupeProductLinesByMagasin((data ?? []) as CaProductDayRow[]);
  const byProductId = new Map<string, number>();
  const byProductIdAndMagasin = new Map<string, Map<string, number>>();
  const magasinSet = new Set<string>();

  for (const row of rows) {
    const productId = row.product_id;
    if (!productId) continue;
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const mag = canonicalMagasinCode(row.magasin);
    magasinSet.add(mag);

    byProductId.set(productId, (byProductId.get(productId) ?? 0) + qty);

    let byMag = byProductIdAndMagasin.get(productId);
    if (!byMag) {
      byMag = new Map();
      byProductIdAndMagasin.set(productId, byMag);
    }
    byMag.set(mag, (byMag.get(mag) ?? 0) + qty);
  }

  const magasinsInData = [...magasinSet].sort(compareMagasinCodes);

  return {
    sales: { byProductId, byProductIdAndMagasin, magasinsInData },
    error: null,
  };
}

export function resolveMagasinColumns(
  sessionMagasinCodes: string[],
  magasinsInData: string[],
): string[] {
  const fromSession = sessionMagasinCodes
    .map((code) => canonicalMagasinCode(code))
    .filter((code, idx, arr) => arr.indexOf(code) === idx);
  if (fromSession.length > 0) return fromSession.sort(compareMagasinCodes);
  return [...magasinsInData];
}

export function mergeProductGroupsWithSales(
  groups: CuisineSubcategoryTotalsGroup[],
  sales: CuisineProductSalesForDate,
  magasinColumns: string[],
): CuisineSubcategoryTotalsGroup[] {
  return groups.map((group) => ({
    ...group,
    products: group.products.map((product) => {
      const byMag = sales.byProductIdAndMagasin.get(product.productId);
      const ventesByMagasin: Record<string, number> = {};
      for (const mag of magasinColumns) {
        ventesByMagasin[mag] = byMag?.get(mag) ?? 0;
      }
      return {
        ...product,
        ventes: sales.byProductId.get(product.productId) ?? 0,
        ventesByMagasin,
      };
    }),
  }));
}
