import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORIQUE_FROM_ISO } from "./constants";
import type { CaResponse, HistoriqueDayRow, HistoriquePayload, PanierMag } from "./types";

function isoDateMinusDays(iso: string, days: number) {
  const [yy, mm, dd] = iso.split("-").map((x) => Number(x));
  if (!yy || !mm || !dd) return iso;
  const t = Date.UTC(yy, mm - 1, dd) - days * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDateCell(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function sumDayRows(rows: { magasin: string; total: unknown }[] | null): {
  totalGlobal: number;
  byMag: Record<string, number>;
} {
  const byMag: Record<string, number> = {};
  let totalGlobal = 0;
  for (const r of rows ?? []) {
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;
    byMag[r.magasin] = (byMag[r.magasin] ?? 0) + t;
    totalGlobal += t;
  }
  return { totalGlobal, byMag };
}

function panierHeureByMagFromRows(
  rows: { magasin: string; hour: unknown; nb: unknown }[] | null,
): Record<string, number[]> {
  const byMag = new Map<string, Map<number, number>>();
  for (const r of rows ?? []) {
    const mag = String(r.magasin ?? "");
    if (!mag) continue;
    const h = typeof r.hour === "number" ? r.hour : Number(r.hour);
    const nb = typeof r.nb === "number" ? r.nb : Number(r.nb);
    if (!Number.isFinite(h) || h < 0 || !Number.isFinite(nb) || nb < 0) continue;
    if (!byMag.has(mag)) byMag.set(mag, new Map());
    const hmap = byMag.get(mag)!;
    const hh = Math.trunc(h);
    hmap.set(hh, (hmap.get(hh) ?? 0) + nb);
  }
  const out: Record<string, number[]> = {};
  for (const [mag, hmap] of byMag) {
    let maxH = 23;
    for (const h of hmap.keys()) if (h > maxH) maxH = h;
    const arr = new Array(maxH + 1).fill(0);
    for (const [h, nb] of hmap) {
      if (h >= 0 && h < arr.length) arr[h] = nb;
    }
    out[mag] = arr;
  }
  return out;
}

function alignPanierHeureByMag(
  raw: Record<string, number[]>,
  magasinsKeys: string[],
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const byLower = new Map<string, number[]>();
  for (const [k, arr] of Object.entries(raw)) {
    if (!arr?.length) continue;
    byLower.set(k.trim().toLowerCase(), arr);
  }
  for (const mag of magasinsKeys) {
    const direct = raw[mag];
    if (direct?.length) {
      out[mag] = direct;
      continue;
    }
    const hit = byLower.get(mag.trim().toLowerCase());
    if (hit?.length) out[mag] = hit;
  }
  return out;
}

async function fetchMaxDailyCaTotal(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magIn?: string[],
): Promise<number | null> {
  let hq = supabase.from("ca_day").select("date,magasin,total").gte("date", from).lte("date", to);
  if (magIn !== undefined) {
    hq = magIn.length === 0 ? hq.in("magasin", ["__none__"]) : hq.in("magasin", magIn);
  }
  const { data, error } = await hq;
  if (error) return null;

  const byDate = new Map<string, number>();
  for (const r of data ?? []) {
    const d = normalizeDateCell(r.date);
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;
    byDate.set(d, (byDate.get(d) ?? 0) + t);
  }

  let max: number | null = null;
  for (const total of byDate.values()) {
    if (max === null || total > max) max = total;
  }
  return max;
}

export async function fetchCaDashboardFromSupabase(
  supabase: SupabaseClient,
  date: string,
  opts?: { magasinCodes?: string[] },
): Promise<{ data: CaResponse } | { error: string }> {
  const codes = opts?.magasinCodes;
  const magIn = codes === undefined ? undefined : codes.length === 0 ? ["__none__"] : codes;

  const ym = date.slice(0, 7);
  const dateJ1 = isoDateMinusDays(date, 1);
  const dateJ7 = isoDateMinusDays(date, 7);
  const todayIso = new Date().toISOString().slice(0, 10);

  let dayQb = supabase.from("ca_day").select("magasin,total,nb_paniers").eq("date", date);
  let j1Qb = supabase.from("ca_day").select("magasin,total").eq("date", dateJ1);
  let j7Qb = supabase.from("ca_day").select("magasin,total").eq("date", dateJ7);
  let monthQb = supabase.from("ca_month").select("magasin,total,nb_paniers").eq("ym", ym);
  let hourQb = supabase.from("ca_panier_hour").select("magasin,hour,nb").eq("date", date);
  if (magIn) {
    dayQb = dayQb.in("magasin", magIn);
    j1Qb = j1Qb.in("magasin", magIn);
    j7Qb = j7Qb.in("magasin", magIn);
    monthQb = monthQb.in("magasin", magIn);
    hourQb = hourQb.in("magasin", magIn);
  }

  const [dayQ, j1Q, j7Q, monthQ, prodQ, hourQ, maxDayTotal] = await Promise.all([
    dayQb,
    j1Qb,
    j7Qb,
    monthQb,
    codes !== undefined
      ? Promise.resolve({ data: [] as { article: string; qty: number; total: number }[], error: null })
      : supabase.from("ca_product_day").select("article,qty,total").eq("date", date),
    hourQb,
    fetchMaxDailyCaTotal(supabase, HISTORIQUE_FROM_ISO, todayIso, magIn),
  ]);

  const firstErr =
    dayQ.error || j1Q.error || j7Q.error || monthQ.error || prodQ.error || hourQ.error;
  if (firstErr) return { error: firstErr.message };

  const dayAgg = sumDayRows(dayQ.data);
  const j1Agg = sumDayRows(j1Q.data);
  const j7Agg = sumDayRows(j7Q.data);

  const magasins: Record<string, Record<string, number>> = {};
  for (const [mag, t] of Object.entries(dayAgg.byMag)) {
    magasins[mag] = { total: t };
  }

  const monthByMag: Record<string, number> = {};
  const monthNbByMag: Record<string, number> = {};
  let monthTotalGlobal = 0;
  for (const r of monthQ.data ?? []) {
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;
    const mag = r.magasin;
    monthByMag[mag] = (monthByMag[mag] ?? 0) + t;
    monthTotalGlobal += t;
    const nbRaw = typeof r.nb_paniers === "number" ? r.nb_paniers : Number(r.nb_paniers);
    const nb = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : 0;
    monthNbByMag[mag] = (monthNbByMag[mag] ?? 0) + nb;
  }
  const panierMois: Record<string, PanierMag> = {};
  for (const mag of new Set([...Object.keys(monthByMag), ...Object.keys(monthNbByMag)])) {
    const ca = monthByMag[mag] ?? 0;
    const nb = monthNbByMag[mag] ?? 0;
    panierMois[mag] = { nbPaniers: nb, panierMoyen: nb > 0 ? ca / nb : null };
  }
  const nbPaniersMoisGlobal = Object.values(monthNbByMag).reduce((a, n) => a + n, 0);
  const panierMoisGlobal: PanierMag = {
    nbPaniers: nbPaniersMoisGlobal,
    panierMoyen: nbPaniersMoisGlobal > 0 ? monthTotalGlobal / nbPaniersMoisGlobal : null,
  };

  const dayCaByMag: Record<string, number> = {};
  const dayNbByMag: Record<string, number> = {};
  for (const r of dayQ.data ?? []) {
    const ca = typeof r.total === "number" ? r.total : Number(r.total);
    const nbRaw = typeof r.nb_paniers === "number" ? r.nb_paniers : Number(r.nb_paniers);
    const nb = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : 0;
    const caOk = Number.isFinite(ca) ? ca : 0;
    const mag = r.magasin;
    dayCaByMag[mag] = (dayCaByMag[mag] ?? 0) + caOk;
    dayNbByMag[mag] = (dayNbByMag[mag] ?? 0) + nb;
  }
  const panierJour: Record<string, PanierMag> = {};
  for (const mag of new Set([...Object.keys(dayCaByMag), ...Object.keys(dayNbByMag)])) {
    const ca = dayCaByMag[mag] ?? 0;
    const nb = dayNbByMag[mag] ?? 0;
    panierJour[mag] = { nbPaniers: nb, panierMoyen: nb > 0 ? ca / nb : null };
  }
  const nbPaniersJourGlobal = Object.values(dayNbByMag).reduce((a, n) => a + n, 0);
  const panierJourGlobal: PanierMag = {
    nbPaniers: nbPaniersJourGlobal,
    panierMoyen: nbPaniersJourGlobal > 0 ? dayAgg.totalGlobal / nbPaniersJourGlobal : null,
  };

  const panierHeureByMag = alignPanierHeureByMag(
    panierHeureByMagFromRows(hourQ.data),
    Object.keys(magasins),
  );

  const prodRows = prodQ.data ?? [];
  const productLines = prodRows
    .map((r) => ({
      name: String(r.article ?? ""),
      ca: typeof r.total === "number" ? r.total : Number(r.total),
      qty: typeof r.qty === "number" ? r.qty : Number(r.qty),
    }))
    .filter((r) => r.name && (Number.isFinite(r.ca) || Number.isFinite(r.qty)));

  const byCa = [...productLines].sort((a, b) => b.ca - a.ca).slice(0, 10);
  const byQty = [...productLines].sort((a, b) => b.qty - a.qty).slice(0, 10);

  const isRecordDay =
    Number.isFinite(dayAgg.totalGlobal) &&
    dayAgg.totalGlobal > 0 &&
    maxDayTotal !== null &&
    dayAgg.totalGlobal >= maxDayTotal;

  const data: CaResponse = {
    totalGlobal: dayAgg.totalGlobal,
    isRecordDay,
    magasins,
    month: {
      ym,
      totalGlobal: monthTotalGlobal,
      magasins: monthByMag,
      panierMois,
      panierMoisGlobal,
    },
    panierJour,
    panierJourGlobal,
    panierHeureByMag,
    compare: {
      date,
      j1: { date: dateJ1, totalGlobal: j1Agg.totalGlobal },
      j7: { date: dateJ7, totalGlobal: j7Agg.totalGlobal },
    },
    topProduits: {
      available: productLines.length > 0,
      byCa,
      byQty,
    },
  };

  return { data };
}

export async function fetchHistoriqueFromSupabase(
  supabase: SupabaseClient,
  from: string,
  to: string,
  opts?: { magasinCodes?: string[] },
): Promise<{ data: HistoriquePayload } | { error: string }> {
  const codes = opts?.magasinCodes;
  let hq = supabase.from("ca_day").select("date,magasin,total").gte("date", from).lte("date", to);
  if (codes !== undefined) {
    hq = codes.length === 0 ? hq.in("magasin", ["__none__"]) : hq.in("magasin", codes);
  }
  const { data: rows, error } = await hq.order("date", { ascending: true });

  if (error) return { error: error.message };

  const byDate = new Map<string, { totalGlobal: number; magasins: Record<string, number> }>();
  for (const r of rows ?? []) {
    const d = normalizeDateCell(r.date);
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;
    if (!byDate.has(d)) byDate.set(d, { totalGlobal: 0, magasins: {} });
    const entry = byDate.get(d)!;
    entry.totalGlobal += t;
    entry.magasins[r.magasin] = (entry.magasins[r.magasin] ?? 0) + t;
  }

  const days: HistoriqueDayRow[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, totalGlobal: v.totalGlobal, magasins: v.magasins }));

  const payload: HistoriquePayload = { from, to, days };
  return { data: payload };
}
