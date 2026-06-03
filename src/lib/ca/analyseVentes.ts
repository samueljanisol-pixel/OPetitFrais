import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VentesAnalyseDailyRow,
  VentesAnalyseFilters,
  VentesAnalyseGroupBy,
  VentesAnalyseLine,
  VentesAnalyseResult,
  VentesAnalyseRow,
} from "./types";

const SANS_CATEGORIE = "__none_cat__";
const SANS_FOURNISSEUR = "__none_sup__";

type ProductCatalogRow = {
  name: string | null;
  category_id: string | null;
  supplier_id: string | null;
  ref_category: { id: string; label: string | null } | Array<{ id: string; label: string | null }> | null;
  ref_supplier: { id: string; label: string | null } | Array<{ id: string; label: string | null }> | null;
};

export type ProductCatalogEntry = {
  categoryId: string | null;
  categoryLabel: string | null;
  supplierId: string | null;
  supplierLabel: string | null;
};

type RpcProductLine = {
  sale_date: unknown
  article: string
  magasin: string
  qty: unknown
  total: unknown
};

function refFromRow(
  raw: { id: string; label: string | null } | Array<{ id: string; label: string | null }> | null,
): { id: string; label: string } | null {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.id) return null;
  return { id: row.id, label: row.label ?? "—" };
}

function normalizeDateCell(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function fetchProductCatalogMap(
  supabase: SupabaseClient,
): Promise<Map<string, ProductCatalogEntry>> {
  const { data: productRows, error } = await supabase
    .from("product")
    .select("name, category_id, supplier_id, ref_category(id, label), ref_supplier(id, label)");

  if (error) {
    return new Map();
  }

  const map = new Map<string, ProductCatalogEntry>();
  for (const row of (productRows ?? []) as ProductCatalogRow[]) {
    if (!row.name) continue;
    const cat = refFromRow(row.ref_category);
    const sup = refFromRow(row.ref_supplier);
    map.set(row.name.trim().toLowerCase(), {
      categoryId: cat?.id ?? row.category_id ?? null,
      categoryLabel: cat?.label ?? null,
      supplierId: sup?.id ?? row.supplier_id ?? null,
      supplierLabel: sup?.label ?? null,
    });
  }
  return map;
}

function enrichRpcLine(row: RpcProductLine, catalog: Map<string, ProductCatalogEntry>): VentesAnalyseLine | null {
  const name = String(row.article ?? "").trim();
  const magasin = String(row.magasin ?? "").trim();
  const date = normalizeDateCell(row.sale_date);
  const ca = typeof row.total === "number" ? row.total : Number(row.total);
  const qty = typeof row.qty === "number" ? row.qty : Number(row.qty);
  if (!name || !magasin || !date) return null;

  const cat = catalog.get(name.toLowerCase()) ?? null;
  return {
    date,
    name,
    ca: Number.isFinite(ca) ? ca : 0,
    qty: Number.isFinite(qty) ? qty : 0,
    magasin,
    categoryId: cat?.categoryId ?? null,
    categoryLabel: cat?.categoryLabel ?? null,
    supplierId: cat?.supplierId ?? null,
    supplierLabel: cat?.supplierLabel ?? null,
  };
}

export async function fetchAnalyseProductLines(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magasinCodes?: string[],
): Promise<{ lines: VentesAnalyseLine[]; rawLineCount: number } | { error: string }> {
  const pMagasins =
    magasinCodes === undefined
      ? null
      : magasinCodes.length === 0
        ? (["__none__"] as string[])
        : magasinCodes;

  const catalog = await fetchProductCatalogMap(supabase);

  const allRows: RpcProductLine[] = [];
  let offset = 0;

  for (;;) {
    const { data: chunk, error: rpcErr } = await supabase
      .rpc("ca_analyse_product_lines", {
        p_from: from,
        p_to: to,
        p_magasins: pMagasins,
      })
      .range(offset, offset + RPC_PAGE_SIZE - 1);

    if (rpcErr) {
      return { error: rpcErr.message };
    }

    const rows = (chunk ?? []) as RpcProductLine[];
    allRows.push(...rows);
    if (rows.length < RPC_PAGE_SIZE) break;
    offset += RPC_PAGE_SIZE;
    if (offset > 500_000) {
      return { error: "Trop de lignes produit sur cette période ; réduisez la plage ou affinez les filtres." };
    }
  }

  const rawLineCount = allRows.length;
  const lines: VentesAnalyseLine[] = [];
  for (const row of allRows) {
    const line = enrichRpcLine(row, catalog);
    if (line) lines.push(line);
  }

  return { lines: filterLinesByMagasinCodes(lines, magasinCodes), rawLineCount };
}

export function applyAnalyseFilters(
  lines: VentesAnalyseLine[],
  filters: Pick<VentesAnalyseFilters, "categoryIds" | "supplierIds" | "productNames">,
): VentesAnalyseLine[] {
  let out = lines;

  if (filters.categoryIds.length > 0) {
    const ids = new Set(filters.categoryIds);
    const wantsNone = ids.has(SANS_CATEGORIE);
    out = out.filter((l) => {
      if (!l.categoryId) return wantsNone;
      return ids.has(l.categoryId);
    });
  }

  if (filters.supplierIds.length > 0) {
    const ids = new Set(filters.supplierIds);
    const wantsNone = ids.has(SANS_FOURNISSEUR);
    out = out.filter((l) => {
      if (!l.supplierId) return wantsNone;
      return ids.has(l.supplierId);
    });
  }

  if (filters.productNames.length > 0) {
    const names = new Set(filters.productNames.map((n) => n.trim().toLowerCase()));
    out = out.filter((l) => names.has(l.name.trim().toLowerCase()));
  }

  return out;
}

export function groupAnalyseLines(lines: VentesAnalyseLine[], groupBy: VentesAnalyseGroupBy): VentesAnalyseRow[] {
  const byKey = new Map<string, VentesAnalyseRow>();

  for (const line of lines) {
    let key: string;
    let label: string;

    switch (groupBy) {
      case "magasin":
        key = line.magasin;
        label = line.magasin;
        break;
      case "categorie":
        key = line.categoryId ?? SANS_CATEGORIE;
        label = line.categoryLabel ?? "Sans catégorie";
        break;
      case "fournisseur":
        key = line.supplierId ?? SANS_FOURNISSEUR;
        label = line.supplierLabel ?? "Sans fournisseur";
        break;
      default:
        key = line.name.trim().toLowerCase();
        label = line.name;
        break;
    }

    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { label, ca: line.ca, qty: line.qty });
      continue;
    }
    cur.ca += line.ca;
    cur.qty += line.qty;
  }

  return Array.from(byKey.values()).sort((a, b) => b.ca - a.ca || a.label.localeCompare(b.label, "fr"));
}

export type VentesAnalyseMetric = "ca" | "qty";

export function buildDailySeriesFromLines(
  lines: VentesAnalyseLine[],
  metric: VentesAnalyseMetric,
): VentesAnalyseDailyRow[] {
  const byDate = new Map<string, number>();
  for (const line of lines) {
    const v = metric === "ca" ? line.ca : line.qty;
    byDate.set(line.date, (byDate.get(line.date) ?? 0) + v);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));
}

export async function fetchAnalyseDailyCa(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magasinCodes?: string[],
): Promise<VentesAnalyseDailyRow[] | { error: string }> {
  const PAGE = 1000;
  const allRows: { date: unknown; magasin: string; total: unknown }[] = [];
  let offset = 0;

  for (;;) {
    let hq = supabase.from("ca_day").select("date,magasin,total").gte("date", from).lte("date", to);
    if (magasinCodes !== undefined) {
      hq = magasinCodes.length === 0 ? hq.in("magasin", ["__none__"]) : hq.in("magasin", magasinCodes);
    }
    const { data: rows, error } = await hq.order("date", { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) return { error: error.message };
    const chunk = rows ?? [];
    allRows.push(...chunk);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  const byDate = new Map<string, number>();
  for (const r of allRows) {
    const d = normalizeDateCell(r.date);
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;
    byDate.set(d, (byDate.get(d) ?? 0) + t);
  }

  return fillDailyRange(
    from,
    to,
    Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total })),
  );
}

export async function fetchVentesAnalyse(
  supabase: SupabaseClient,
  filters: VentesAnalyseFilters,
): Promise<{ data: VentesAnalyseResult } | { error: string }> {
  const magasinCodes = filters.magasinCodes;

  const [linesRes] = await Promise.all([
    fetchAnalyseProductLines(supabase, filters.from, filters.to, magasinCodes),
  ]);

  if ("error" in linesRes) return { error: linesRes.error };

  const filtered = applyAnalyseFilters(linesRes.lines, filters);

  const totalCaPeriod = linesRes.lines.reduce((acc, l) => acc + (Number.isFinite(l.ca) ? l.ca : 0), 0);
  const totalCaFiltered = filtered.reduce((acc, l) => acc + (Number.isFinite(l.ca) ? l.ca : 0), 0);
  const caPercentOfPeriod =
    totalCaPeriod > 0 ? Math.min(100, (totalCaFiltered / totalCaPeriod) * 100) : null;

  const dailyCa = fillDailyRange(
    filters.from,
    filters.to,
    buildDailySeriesFromLines(filtered, "ca"),
  );

  return {
    data: {
      from: filters.from,
      to: filters.to,
      lines: filtered,
      dailyCa,
      rawLineCount: linesRes.rawLineCount,
      totalCaPeriod,
      caPercentOfPeriod,
    },
  };
}

export { SANS_CATEGORIE, SANS_FOURNISSEUR };

const RPC_PAGE_SIZE = 1000;

/** Jours où des ventes par magasin existent : on ignore __all__ ces jours-là (comme TOP 10 CA). */
export function applyLegacyMagasinRule(lines: VentesAnalyseLine[]): VentesAnalyseLine[] {
  const datesWithPerMag = new Set<string>();
  for (const l of lines) {
    if (l.magasin !== "__all__") datesWithPerMag.add(l.date);
  }
  return lines.filter((l) => l.magasin !== "__all__" || !datesWithPerMag.has(l.date));
}

/** Filtre magasin explicite : pas de lignes __all__. */
export function filterLinesByMagasinCodes(
  lines: VentesAnalyseLine[],
  magasinCodes: string[] | undefined,
): VentesAnalyseLine[] {
  if (magasinCodes === undefined) {
    return applyLegacyMagasinRule(lines);
  }
  if (magasinCodes.length === 0) {
    return [];
  }
  const set = new Set(magasinCodes);
  return lines.filter((l) => l.magasin !== "__all__" && set.has(l.magasin));
}

function isoDateAddDays(iso: string, days: number): string {
  const [yy, mm, dd] = iso.split("-").map((x) => Number(x));
  const t = Date.UTC(yy, mm - 1, dd) + days * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Tous les jours de la plage pour le graphique (jours sans vente = 0). */
export function fillDailyRange(
  from: string,
  to: string,
  points: VentesAnalyseDailyRow[],
): VentesAnalyseDailyRow[] {
  const map = new Map(points.map((p) => [p.date, p.total]));
  const out: VentesAnalyseDailyRow[] = [];
  let cur = from;
  while (cur <= to) {
    out.push({ date: cur, total: map.get(cur) ?? 0 });
    cur = isoDateAddDays(cur, 1);
  }
  return out;
}
