import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORIQUE_FROM_ISO } from "./constants";
import { catalogEntryForProductId, fetchProductCatalogIndex } from "./productCatalogMatch";
import type {
  CaResponse,
  CaRecordRef,
  CaTopProduitLine,
  CaTopProduitsPayload,
  HistoriqueDayRow,
  HistoriqueMonthCharges,
  HistoriquePayload,
  PanierMag,
} from "./types";
import { buildTopProduitRankings, filterTopProduitLines } from "./topProduits";
import { fetchTotalKgQtyForDateRange, monthDateBounds, sumKgQtyFromTopProduitLines } from "./totalKg";
import {
  enrichCaTopProduitLines,
  fetchBenefitByDayMagasinForDateRange,
  fetchBenefitTotalsForDateRange,
} from "./benefitFromSales";
import {
  aggregateChargesByYmInRange,
  aggregateChargesForDay,
  aggregateChargesForMonth,
  benefitNet,
  daysInPeriodForMonthYm,
  fetchMagasinChargeLines,
} from "./magasinCharges";
import {
  canonicalMagasinCode,
  expandMagasinCodeAliases,
  lookupByCanonicalMagasin,
} from "./magasinCode";

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

function findPreviousRecord(
  dayTotals: Array<{ date: string; total: number }>,
  currentTotal: number,
): CaRecordRef | null {
  let best: CaRecordRef | null = null
  for (const row of dayTotals) {
    if (row.total >= currentTotal) continue
    if (!best || row.total > best.total) {
      best = { date: row.date, total: row.total }
    }
  }
  return best
}

async function fetchMaxDailyCaRecords(
  supabase: SupabaseClient,
  from: string,
  to: string,
  magIn?: string[],
): Promise<{
  globalMax: number | null
  maxByMag: Record<string, number>
  globalDayTotals: Array<{ date: string; total: number }>
  magDayTotals: Record<string, Array<{ date: string; total: number }>>
}> {
  let hq = supabase.from("ca_day").select("date,magasin,total").gte("date", from).lte("date", to);
  if (magIn !== undefined) {
    hq = magIn.length === 0 ? hq.in("magasin", ["__none__"]) : hq.in("magasin", magIn);
  }
  const { data, error } = await hq;
  if (error) {
    return { globalMax: null, maxByMag: {}, globalDayTotals: [], magDayTotals: {} };
  }

  const byDate = new Map<string, number>();
  const byMagDate = new Map<string, Map<string, number>>();

  for (const r of data ?? []) {
    const d = normalizeDateCell(r.date);
    const mag = String(r.magasin ?? "");
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;

    byDate.set(d, (byDate.get(d) ?? 0) + t);

    if (!mag) continue;
    if (!byMagDate.has(mag)) byMagDate.set(mag, new Map());
    const magDays = byMagDate.get(mag)!;
    magDays.set(d, (magDays.get(d) ?? 0) + t);
  }

  let globalMax: number | null = null;
  for (const total of byDate.values()) {
    if (globalMax === null || total > globalMax) globalMax = total;
  }

  const maxByMag: Record<string, number> = {};
  for (const [mag, days] of byMagDate) {
    let max: number | null = null;
    for (const total of days.values()) {
      if (max === null || total > max) max = total;
    }
    if (max !== null) maxByMag[mag] = max;
  }

  const globalDayTotals = Array.from(byDate.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const magDayTotals: Record<string, Array<{ date: string; total: number }>> = {};
  for (const [mag, days] of byMagDate) {
    magDayTotals[mag] = Array.from(days.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return { globalMax, maxByMag, globalDayTotals, magDayTotals };
}

/** Magasins du jour (ca_day) + magasins présents dans ca_product_day. */
function mergeTopMagasinFilterList(productMagasins: string[], dayMagasins: string[]): string[] {
  return [...new Set([...dayMagasins, ...productMagasins].filter((m) => m && m !== "__all__"))].sort((a, b) =>
    a.localeCompare(b),
  );
}

async function buildTopProduitsForDate(
  supabase: SupabaseClient,
  date: string,
  magIn?: string[],
): Promise<CaTopProduitsPayload> {
  let prodQb = supabase.from("ca_product_day").select("article,product_id,qty,total,magasin").eq("date", date);
  if (magIn !== undefined) {
    prodQb = magIn.length === 0 ? prodQb.in("magasin", ["__none__"]) : prodQb.in("magasin", magIn);
  }

  const [{ data: prodRows, error: prodErr }, catalog] = await Promise.all([
    prodQb,
    fetchProductCatalogIndex(supabase),
  ]);

  if (prodErr) {
    return {
      available: false,
      lines: [],
      filterMagasins: [],
      filterCategories: [],
      byCa: [],
      byQty: [],
    };
  }

  const lines: CaTopProduitLine[] = [];
  for (const r of prodRows ?? []) {
    const article = String(r.article ?? "").trim();
    const ca = typeof r.total === "number" ? r.total : Number(r.total);
    const qty = typeof r.qty === "number" ? r.qty : Number(r.qty);
    const magasin = String(r.magasin ?? "__all__");
    const productId =
      typeof r.product_id === "string" && r.product_id.length > 0 ? r.product_id : null;
    if (!article || (!Number.isFinite(ca) && !Number.isFinite(qty))) continue;

    const linked =
      catalogEntryForProductId(catalog, productId) ?? catalog.resolveByCode(null, article);
    lines.push({
      name: linked?.name ?? article,
      productId: linked?.productId ?? productId,
      ca: Number.isFinite(ca) ? ca : 0,
      qty: Number.isFinite(qty) ? qty : 0,
      magasin,
      categoryId: linked?.categoryId ?? null,
      categoryLabel: linked?.categoryLabel ?? null,
      salesUnitLabel: linked?.salesUnitLabel ?? null,
      salesUnitCode: linked?.salesUnitCode ?? null,
    });
  }

  const filterMagasins = [...new Set(lines.map(l => l.magasin).filter(m => m !== "__all__"))].sort();
  const categoriesMap = new Map<string, string>();
  for (const line of lines) {
    if (line.categoryId && line.categoryLabel) {
      categoriesMap.set(line.categoryId, line.categoryLabel);
    }
  }
  const filterCategories = Array.from(categoriesMap.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const defaultRankings = buildTopProduitRankings(filterTopProduitLines(lines, "all", "all"));

  return {
    available: lines.length > 0,
    lines,
    filterMagasins,
    filterCategories,
    byCa: defaultRankings.byCa,
    byQty: defaultRankings.byQty,
  };
}

export async function fetchCaDashboardFromSupabase(
  supabase: SupabaseClient,
  date: string,
  opts?: { magasinCodes?: string[] },
): Promise<{ data: CaResponse } | { error: string }> {
  const codes = opts?.magasinCodes;
  /** Filtre CA (`ca_day`…) : codes session tels quels (évite double comptage M01+M1). */
  const magInCa =
    codes === undefined ? undefined : codes.length === 0 ? ["__none__"] : codes;
  /** Filtre bénéfice produit : aliases M01/M1 pour joindre `ca_product_day`. */
  const magInBenefit =
    codes === undefined
      ? undefined
      : codes.length === 0
        ? ["__none__"]
        : expandMagasinCodeAliases(codes);

  const ym = date.slice(0, 7);
  const dateJ1 = isoDateMinusDays(date, 1);
  const dateJ7 = isoDateMinusDays(date, 7);
  const todayIso = new Date().toISOString().slice(0, 10);

  let dayQb = supabase.from("ca_day").select("magasin,total,nb_paniers").eq("date", date);
  let j1Qb = supabase.from("ca_day").select("magasin,total").eq("date", dateJ1);
  let j7Qb = supabase.from("ca_day").select("magasin,total").eq("date", dateJ7);
  let monthQb = supabase.from("ca_month").select("magasin,total,nb_paniers").eq("ym", ym);
  let hourQb = supabase.from("ca_panier_hour").select("magasin,hour,nb").eq("date", date);
  if (magInCa) {
    dayQb = dayQb.in("magasin", magInCa);
    j1Qb = j1Qb.in("magasin", magInCa);
    j7Qb = j7Qb.in("magasin", magInCa);
    monthQb = monthQb.in("magasin", magInCa);
    hourQb = hourQb.in("magasin", magInCa);
  }

  const monthBounds = monthDateBounds(ym);
  const [
    dayQ,
    j1Q,
    j7Q,
    monthQ,
    hourQ,
    maxDayRecords,
    topProduitsRaw,
    totalKgMois,
    monthBenefitTotals,
    dayBenefitByMagRes,
    monthBenefitByMagRes,
    chargeLinesRes,
  ] = await Promise.all([
    dayQb,
    j1Qb,
    j7Qb,
    monthQb,
    hourQb,
    fetchMaxDailyCaRecords(supabase, HISTORIQUE_FROM_ISO, todayIso, magInCa),
    buildTopProduitsForDate(supabase, date, magInBenefit),
    fetchTotalKgQtyForDateRange(supabase, monthBounds.from, monthBounds.to, magInBenefit),
    fetchBenefitTotalsForDateRange(supabase, monthBounds.from, monthBounds.to, magInBenefit),
    // Jour seul : évite l’échec « trop de lignes » du fetch mois entier (qui laissait le bénéfice magasin à 0).
    fetchBenefitByDayMagasinForDateRange(supabase, date, date, magInBenefit),
    fetchBenefitByDayMagasinForDateRange(supabase, monthBounds.from, monthBounds.to, magInBenefit),
    fetchMagasinChargeLines(supabase),
  ]);

  const firstErr = dayQ.error || j1Q.error || j7Q.error || monthQ.error || hourQ.error;
  if (firstErr) return { error: firstErr.message };
  if ("error" in chargeLinesRes) return { error: chargeLinesRes.error };

  const dayAgg = sumDayRows(dayQ.data);
  const j1Agg = sumDayRows(j1Q.data);
  const j7Agg = sumDayRows(j7Q.data);

  const magasins: Record<string, Record<string, number>> = {};
  for (const [mag, t] of Object.entries(dayAgg.byMag)) {
    magasins[mag] = { total: t };
  }

  let topProduits = topProduitsRaw;

  topProduits.filterMagasins = mergeTopMagasinFilterList(
    topProduits.filterMagasins,
    Object.keys(magasins),
  );

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

  const isRecordDay =
    Number.isFinite(dayAgg.totalGlobal) &&
    dayAgg.totalGlobal > 0 &&
    maxDayRecords.globalMax !== null &&
    dayAgg.totalGlobal >= maxDayRecords.globalMax;

  const previousRecordDay = isRecordDay
    ? findPreviousRecord(maxDayRecords.globalDayTotals, dayAgg.totalGlobal)
    : null;

  const isRecordDayByMag: Record<string, boolean> = {};
  const previousRecordDayByMag: Record<string, CaRecordRef> = {};
  for (const mag of Object.keys(dayCaByMag)) {
    const ca = dayCaByMag[mag] ?? 0;
    const max = maxDayRecords.maxByMag[mag];
    if (Number.isFinite(ca) && ca > 0 && max !== undefined && ca >= max) {
      isRecordDayByMag[mag] = true;
      const prev = findPreviousRecord(maxDayRecords.magDayTotals[mag] ?? [], ca);
      if (prev) previousRecordDayByMag[mag] = prev;
    }
  }

  const totalKgJour = topProduits.available ? sumKgQtyFromTopProduitLines(topProduits.lines) : 0;

  // Totaux bénéfice jour : même moteur que le détail par magasin (fetch jour seul).
  let dayBenefitEntry =
    !("error" in dayBenefitByMagRes) ? dayBenefitByMagRes.get(date) ?? null : null;
  if (!dayBenefitEntry && !("error" in dayBenefitByMagRes) && dayBenefitByMagRes.size > 0) {
    // Repli si la clé date du Map ne matche pas exactement (format / timezone).
    for (const [k, v] of dayBenefitByMagRes) {
      if (k.slice(0, 10) === date.slice(0, 10)) {
        dayBenefitEntry = v;
        break;
      }
    }
    if (!dayBenefitEntry && dayBenefitByMagRes.size === 1) {
      dayBenefitEntry = dayBenefitByMagRes.values().next().value ?? null;
    }
  }
  let totalBenefitJour = dayBenefitEntry?.benefit;
  let caWithMarginJour = dayBenefitEntry?.caWithMargin;

  if (topProduits.available && topProduits.lines.length > 0) {
    const enriched = await enrichCaTopProduitLines(supabase, topProduits.lines, date);
    if (!("error" in enriched)) {
      topProduits = {
        ...topProduits,
        lines: enriched,
        byCa: buildTopProduitRankings(
          filterTopProduitLines(enriched, "all", "all"),
        ).byCa,
        byQty: buildTopProduitRankings(
          filterTopProduitLines(enriched, "all", "all"),
        ).byQty,
      };
    }
  }

  const monthTotalBenefit =
    typeof monthBenefitTotals === 'object' && 'benefit' in monthBenefitTotals
      ? monthBenefitTotals.benefit
      : undefined;
  const monthCaWithMargin =
    typeof monthBenefitTotals === 'object' && 'caWithMargin' in monthBenefitTotals
      ? monthBenefitTotals.caWithMargin
      : undefined;

  const dayCharges = aggregateChargesForDay(chargeLinesRes.lines, date, codes);
  const monthDaysInPeriod = daysInPeriodForMonthYm(ym, todayIso);
  const monthCharges = aggregateChargesForMonth(chargeLinesRes.lines, monthDaysInPeriod, codes);

  /** Clés d’affichage = codes `ca_day` (cartes magasin) ; jointure tolérante M01/M1. */
  const displayMagKeys = [
    ...new Set([
      ...Object.keys(magasins),
      ...Object.keys(dayCharges.byMag),
      ...Object.keys(monthCharges.byMag),
    ]),
  ];

  const magasinsBenefitJour: Record<string, number> = {};
  const magasinsChargesJour: Record<string, number> = {};
  const magasinsBenefitNetJour: Record<string, number> = {};
  const magasinsBenefitMonthRaw: Record<string, number> = {};
  const magasinsChargesMonth: Record<string, number> = {};
  const magasinsBenefitNetMonth: Record<string, number> = {};

  const benefitByMagRaw: Record<string, number> = {};
  for (const [mag, t] of Object.entries(dayBenefitEntry?.byMag ?? {})) {
    if (mag === "__all__") continue;
    benefitByMagRaw[mag.trim()] = t.benefit;
  }
  // Repli TOP enrichi si le ventilé par magasin est vide mais les lignes TOP ont un bénéfice.
  if (Object.keys(benefitByMagRaw).length === 0) {
    for (const line of topProduits.lines) {
      if (line.benefit == null || !Number.isFinite(line.benefit)) continue;
      const mag = String(line.magasin ?? "").trim();
      if (!mag || mag === "__all__") continue;
      benefitByMagRaw[mag] = (benefitByMagRaw[mag] ?? 0) + line.benefit;
    }
    if (totalBenefitJour == null && Object.keys(benefitByMagRaw).length > 0) {
      totalBenefitJour = Object.values(benefitByMagRaw).reduce((a, b) => a + b, 0);
    }
  }
  // Repli : si seules des lignes legacy `__all__` existent, rattacher au magasin unique du jour.
  const allLegacy = dayBenefitEntry?.byMag?.["__all__"]?.benefit;
  if (
    Object.keys(benefitByMagRaw).length === 0 &&
    allLegacy != null &&
    Number.isFinite(allLegacy) &&
    Object.keys(magasins).length === 1
  ) {
    benefitByMagRaw[Object.keys(magasins)[0]!] = allLegacy;
    if (totalBenefitJour == null) totalBenefitJour = allLegacy;
  }

  if (!("error" in monthBenefitByMagRes)) {
    for (const day of monthBenefitByMagRes.values()) {
      for (const [mag, t] of Object.entries(day.byMag)) {
        if (mag === "__all__") continue;
        const key = mag.trim();
        magasinsBenefitMonthRaw[key] = (magasinsBenefitMonthRaw[key] ?? 0) + t.benefit;
      }
    }
  }

  // Replier les clés bénéfice (souvent M1) sur les clés d’affichage (souvent M01).
  const monthBenefitRemapped: Record<string, number> = {};
  for (const mag of displayMagKeys) {
    const benJour = lookupByCanonicalMagasin(benefitByMagRaw, mag) ?? 0;
    const chJour = lookupByCanonicalMagasin(dayCharges.byMag, mag) ?? 0;
    magasinsBenefitJour[mag] = benJour;
    magasinsChargesJour[mag] = chJour;
    magasinsBenefitNetJour[mag] = benJour - chJour;

    const benMois = lookupByCanonicalMagasin(magasinsBenefitMonthRaw, mag) ?? 0;
    const chMois = lookupByCanonicalMagasin(monthCharges.byMag, mag) ?? 0;
    monthBenefitRemapped[mag] = benMois;
    magasinsChargesMonth[mag] = chMois;
    magasinsBenefitNetMonth[mag] = benMois - chMois;
  }

  for (const [mag, ben] of Object.entries(benefitByMagRaw)) {
    const already = displayMagKeys.some((k) => canonicalMagasinCode(k) === canonicalMagasinCode(mag));
    if (already) continue;
    magasinsBenefitJour[mag] = ben;
    magasinsChargesJour[mag] = lookupByCanonicalMagasin(dayCharges.byMag, mag) ?? 0;
    magasinsBenefitNetJour[mag] = ben - magasinsChargesJour[mag];
  }
  for (const [mag, ben] of Object.entries(magasinsBenefitMonthRaw)) {
    const already = displayMagKeys.some((k) => canonicalMagasinCode(k) === canonicalMagasinCode(mag));
    if (already) continue;
    monthBenefitRemapped[mag] = ben;
    magasinsChargesMonth[mag] = lookupByCanonicalMagasin(monthCharges.byMag, mag) ?? 0;
    magasinsBenefitNetMonth[mag] = ben - magasinsChargesMonth[mag];
  }

  const data: CaResponse = {
    totalGlobal: dayAgg.totalGlobal,
    totalKgJour,
    totalBenefitJour,
    caWithMarginJour,
    totalChargesJour: dayCharges.total,
    chargesGeneralJour: dayCharges.general,
    magasinsChargesJour,
    magasinsBenefitJour,
    totalBenefitNetJour: benefitNet(totalBenefitJour, dayCharges.total),
    magasinsBenefitNetJour,
    isRecordDay,
    previousRecordDay,
    isRecordDayByMag,
    previousRecordDayByMag,
    magasins,
    month: {
      ym,
      totalGlobal: monthTotalGlobal,
      totalKg: totalKgMois,
      totalBenefit: monthTotalBenefit,
      caWithMargin: monthCaWithMargin,
      totalCharges: monthCharges.total,
      chargesGeneral: monthCharges.general,
      magasinsCharges: magasinsChargesMonth,
      magasinsBenefit: monthBenefitRemapped,
      totalBenefitNet: benefitNet(monthTotalBenefit, monthCharges.total),
      magasinsBenefitNet: magasinsBenefitNetMonth,
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
    topProduits,
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
  const magInCa =
    codes === undefined ? undefined : codes.length === 0 ? ["__none__"] : codes;
  const magInBenefit =
    codes === undefined
      ? undefined
      : codes.length === 0
        ? ["__none__"]
        : expandMagasinCodeAliases(codes);
  let hq = supabase.from("ca_day").select("date,magasin,total,nb_paniers").gte("date", from).lte("date", to);
  if (magInCa !== undefined) {
    hq = hq.in("magasin", magInCa);
  }
  const [dayRes, benefitBreakdown, chargeLinesRes] = await Promise.all([
    hq.order("date", { ascending: true }),
    fetchBenefitByDayMagasinForDateRange(supabase, from, to, magInBenefit),
    fetchMagasinChargeLines(supabase),
  ]);

  if (dayRes.error) return { error: dayRes.error.message };
  if ("error" in benefitBreakdown) return { error: benefitBreakdown.error };
  if ("error" in chargeLinesRes) return { error: chargeLinesRes.error };

  const byDate = new Map<
    string,
    {
      totalGlobal: number
      nbPaniersGlobal: number
      magasins: Record<string, number>
      magasinsNbPaniers: Record<string, number>
      totalBenefit: number
      caWithMargin: number
      magasinsBenefit: Record<string, number>
      magasinsCaWithMargin: Record<string, number>
    }
  >();
  for (const r of dayRes.data ?? []) {
    const d = normalizeDateCell(r.date);
    const t = typeof r.total === "number" ? r.total : Number(r.total);
    if (!Number.isFinite(t)) continue;
    const nbRaw = typeof r.nb_paniers === "number" ? r.nb_paniers : Number(r.nb_paniers);
    const nb = Number.isFinite(nbRaw) ? nbRaw : 0;
    if (!byDate.has(d)) {
      byDate.set(d, {
        totalGlobal: 0,
        nbPaniersGlobal: 0,
        magasins: {},
        magasinsNbPaniers: {},
        totalBenefit: 0,
        caWithMargin: 0,
        magasinsBenefit: {},
        magasinsCaWithMargin: {},
      });
    }
    const entry = byDate.get(d)!;
    entry.totalGlobal += t;
    entry.nbPaniersGlobal += nb;
    entry.magasins[r.magasin] = (entry.magasins[r.magasin] ?? 0) + t;
    entry.magasinsNbPaniers[r.magasin] = (entry.magasinsNbPaniers[r.magasin] ?? 0) + nb;
  }

  for (const [date, dayBenefit] of benefitBreakdown) {
    if (!byDate.has(date)) {
      byDate.set(date, {
        totalGlobal: 0,
        nbPaniersGlobal: 0,
        magasins: {},
        magasinsNbPaniers: {},
        totalBenefit: 0,
        caWithMargin: 0,
        magasinsBenefit: {},
        magasinsCaWithMargin: {},
      });
    }
    const entry = byDate.get(date)!;
    entry.totalBenefit = dayBenefit.benefit;
    entry.caWithMargin = dayBenefit.caWithMargin;
    for (const [mag, magTotals] of Object.entries(dayBenefit.byMag)) {
      entry.magasinsBenefit[mag] = magTotals.benefit;
      entry.magasinsCaWithMargin[mag] = magTotals.caWithMargin;
    }
  }

  const days: HistoriqueDayRow[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      const dayCharges = aggregateChargesForDay(chargeLinesRes.lines, date, codes);
      const displayKeys = [
        ...new Set([
          ...Object.keys(v.magasins),
          ...Object.keys(v.magasinsBenefit),
          ...Object.keys(dayCharges.byMag),
        ]),
      ];
      const magasinsBenefit: Record<string, number> = {};
      const magasinsCaWithMargin: Record<string, number> = {};
      const magasinsCharges: Record<string, number> = {};
      const magasinsBenefitNet: Record<string, number> = {};
      for (const mag of displayKeys) {
        const ben = lookupByCanonicalMagasin(v.magasinsBenefit, mag) ?? 0;
        const caM = lookupByCanonicalMagasin(v.magasinsCaWithMargin, mag) ?? 0;
        const ch = lookupByCanonicalMagasin(dayCharges.byMag, mag) ?? 0;
        magasinsBenefit[mag] = ben;
        magasinsCaWithMargin[mag] = caM;
        magasinsCharges[mag] = ch;
        magasinsBenefitNet[mag] = ben - ch;
      }
      return {
        date,
        totalGlobal: v.totalGlobal,
        nbPaniersGlobal: v.nbPaniersGlobal,
        magasins: v.magasins,
        magasinsNbPaniers: v.magasinsNbPaniers,
        totalBenefit: v.totalBenefit,
        caWithMargin: v.caWithMargin,
        magasinsBenefit,
        magasinsCaWithMargin,
        totalCharges: dayCharges.total,
        chargesGeneral: dayCharges.general,
        magasinsCharges,
        totalBenefitNet: v.totalBenefit - dayCharges.total,
        magasinsBenefitNet,
      };
    });

  const daysInPeriodByYm: Record<string, number> = {};
  for (const d of days) {
    const ym = d.date.slice(0, 7);
    daysInPeriodByYm[ym] = (daysInPeriodByYm[ym] ?? 0) + 1;
  }
  const chargesByYmRaw = aggregateChargesByYmInRange(
    chargeLinesRes.lines,
    from,
    to,
    codes,
    daysInPeriodByYm,
  );
  const displayMagsAll = [
    ...new Set(days.flatMap((d) => [...Object.keys(d.magasins), ...Object.keys(d.magasinsBenefit)])),
  ];
  const chargesByYm: Record<string, HistoriqueMonthCharges> = {};
  for (const [ymKey, totals] of Object.entries(chargesByYmRaw)) {
    const byMag: Record<string, number> = {};
    for (const mag of displayMagsAll) {
      byMag[mag] = lookupByCanonicalMagasin(totals.byMag, mag) ?? 0;
    }
    for (const [mag, amount] of Object.entries(totals.byMag)) {
      const already = displayMagsAll.some(
        (k) => canonicalMagasinCode(k) === canonicalMagasinCode(mag),
      );
      if (!already) byMag[mag] = amount;
    }
    chargesByYm[ymKey] = {
      total: totals.total,
      general: totals.general,
      byMag,
    };
  }

  const payload: HistoriquePayload = { from, to, days, chargesByYm };
  return { data: payload };
}
