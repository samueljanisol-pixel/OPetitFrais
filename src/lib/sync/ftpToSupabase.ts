import { Client } from "basic-ftp";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  extractMonthCaFromJson,
  extractNbPaniers,
  extractPanierHeureBuckets,
  extractProductLines,
  extractTotalJourFromJson,
  mergePanierHeureBuckets,
} from "@/lib/ventesJson";

function extractIsoDayFromFilename(name: string): string | null {
  const m = name.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function ftpEnv() {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  if (!host || !user || !password) throw new Error("FTP non configuré (FTP_HOST/FTP_USER/FTP_PASSWORD)");
  return { host, user, password };
}

function normalizeMagasinCode(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  return code.length > 0 ? code : null;
}

/** Alimente `/api/supabase/sync/status` (table `sync_runs`). */
export async function recordSyncRun(payload: {
  started_at: string;
  status: "success" | "error";
  message: string | null;
  last_synced_date: string | null;
  processed_days: number;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const finished_at = new Date().toISOString();
  const { error } = await supabase.from("sync_runs").insert({
    started_at: payload.started_at,
    finished_at,
    status: payload.status,
    message: payload.message,
    last_synced_date: payload.last_synced_date,
    processed_days: payload.processed_days,
  });
  if (error) throw new Error(error.message);
}

/** Toutes les dates jour (YYYY-MM-DD) trouvées dans les noms de fichiers sous `/ventes`. */
export async function listDayIsoDatesOnFtp(): Promise<string[]> {
  const { host, user, password } = ftpEnv();
  const ftp = new Client();
  const found = new Set<string>();
  try {
    await ftp.access({ host, user, password, secure: false });
    const magasinsAll = await ftp.list("/ventes");
    const magasins = magasinsAll.filter((m) => m.isDirectory && m.name !== "M00");
    for (const mag of magasins) {
      const magasinPath = `/ventes/${mag.name}`;
      const caisses = await ftp.list(magasinPath);
      for (const c of caisses) {
        if (!c.isDirectory) continue;
        const caissePath = `${magasinPath}/${c.name}`;
        const files = await ftp.list(caissePath);
        for (const f of files) {
          if (!f.name) continue;
          const iso = extractIsoDayFromFilename(f.name);
          if (iso) found.add(iso);
        }
      }
    }
  } finally {
    ftp.close();
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

export type SyncDateResult = Awaited<ReturnType<typeof syncDateToSupabase>>;

export type SyncAllProgress = {
  date: string;
  index: number;
  total: number;
  result?: SyncDateResult;
};

/**
 * Synchronise vers Supabase chaque jour présent sur le FTP (fichiers `ventes_…YYYY-MM-DD…json`).
 * Les mois sont mis à jour à chaque passage comme dans `syncDateToSupabase`.
 */
export async function syncAllFtpDatesToSupabase(options?: {
  from?: string;
  to?: string;
  /** Limite optionnelle du nombre de jours traités (après filtre from/to). */
  maxDays?: number;
  onProgress?: (p: SyncAllProgress) => void;
}): Promise<{
  dates: string[];
  processed: number;
  errors: Array<{ date: string; message: string }>;
}> {
  let dates = await listDayIsoDatesOnFtp();
  if (options?.from) dates = dates.filter((d) => d >= options.from!);
  if (options?.to) dates = dates.filter((d) => d <= options.to!);
  if (options?.maxDays != null && options.maxDays > 0) dates = dates.slice(0, options.maxDays);

  const started_at = new Date().toISOString();
  const errors: Array<{ date: string; message: string }> = [];
  let processed = 0;
  let lastSuccessDate: string | null = null;
  const total = dates.length;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      const result = await syncDateToSupabase(date);
      processed += 1;
      lastSuccessDate = date;
      options?.onProgress?.({ date, index: i, total, result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ date, message });
      options?.onProgress?.({ date, index: i, total });
    }
  }

  try {
    await recordSyncRun({
      started_at,
      status: errors.length ? "error" : "success",
      message:
        errors.length > 0
          ? `${errors.length} jour(s) en erreur (ex. ${errors[0]!.date}: ${errors[0]!.message})`
          : total === 0
            ? "Aucune date trouvée sur le FTP"
            : null,
      last_synced_date: lastSuccessDate,
      processed_days: processed,
    });
  } catch {
    /* ne pas masquer le résultat métier si l’historique sync_runs échoue */
  }

  return { dates, processed, errors };
}

export async function syncDateToSupabase(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date invalide (YYYY-MM-DD)");

  const { host, user, password } = ftpEnv();

  const ym = date.slice(0, 7);
  const monthFileName = `ventes_${ym}.json`;

  const ftp = new Client();
  try {
    await ftp.access({ host, user, password, secure: false });
    const magasinsAll = await ftp.list("/ventes");
    const magasins = magasinsAll.filter((m) => m.isDirectory && m.name !== "M00");

    const dayByMagasin: Record<string, number> = {};
    const monthByMagasin: Record<string, number> = {};
    const paniersJourByMag: Record<string, number> = {};
    const paniersMoisByMag: Record<string, number> = {};
    const panierHeureByMag: Record<string, number[]> = {};
    const productByMag = new Map<string, Map<string, { qty: number; total: number }>>();

    for (const mag of magasins) {
      const magCode = normalizeMagasinCode(mag.name);
      if (!magCode) continue;

      const magasinPath = `/ventes/${magCode}`;
      const caisses = await ftp.list(magasinPath);

      for (const c of caisses) {
        if (!c.isDirectory) continue;
        const caissePath = `${magasinPath}/${c.name}`;
        const files = await ftp.list(caissePath);

        for (const f of files) {
          const isDay = f.name.includes(date);
          const isMonth = f.name === monthFileName;
          if (!isDay && !isMonth) continue;

          const tempFile = path.join(os.tmpdir(), f.name);
          await ftp.downloadTo(tempFile, `${caissePath}/${f.name}`);
          const raw = await fs.readFile(tempFile, "utf8");
          await fs.unlink(tempFile).catch(() => {});

          let parsed: unknown = null;
          try {
            parsed = JSON.parse(raw) as unknown;
          } catch {
            parsed = null;
          }

          if (isDay) {
            const tj = extractTotalJourFromJson(parsed);
            dayByMagasin[magCode] = (dayByMagasin[magCode] ?? 0) + tj;

            const buckets = extractPanierHeureBuckets(parsed);
            let nbJour = extractNbPaniers(parsed);
            if (!nbJour && buckets.length) nbJour = buckets.reduce((a, b) => a + b, 0);
            if (nbJour > 0) paniersJourByMag[magCode] = (paniersJourByMag[magCode] ?? 0) + nbJour;
            if (buckets.length) {
              panierHeureByMag[magCode] = mergePanierHeureBuckets(panierHeureByMag[magCode], buckets);
            }

            const lines = extractProductLines(parsed);
            if (!productByMag.has(magCode)) productByMag.set(magCode, new Map());
            const magProducts = productByMag.get(magCode)!;
            for (const l of lines) {
              const article = l.name.trim();
              if (!article) continue;
              const prev = magProducts.get(article) ?? { qty: 0, total: 0 };
              magProducts.set(article, { qty: prev.qty + l.qty, total: prev.total + l.ca });
            }
          } else if (isMonth) {
            const monthCa = extractMonthCaFromJson(parsed);
            if (monthCa > 0) {
              monthByMagasin[magCode] = (monthByMagasin[magCode] ?? 0) + monthCa;
            }
            const nbMois = extractNbPaniers(parsed);
            if (nbMois > 0) paniersMoisByMag[magCode] = (paniersMoisByMag[magCode] ?? 0) + nbMois;
          }
        }
      }
    }

    const supabase = createSupabaseServiceRoleClient();

    const caDayRows = Object.entries(dayByMagasin).map(([magasin, total]) => ({
      date,
      magasin,
      total,
      nb_paniers: paniersJourByMag[magasin] ?? 0,
    }));
    if (caDayRows.length) {
      const { error } = await supabase.from("ca_day").upsert(caDayRows);
      if (error) throw new Error(error.message);
    }

    const caMonthRows = Object.entries(monthByMagasin).map(([magasin, total]) => ({
      ym,
      magasin,
      total,
      nb_paniers: paniersMoisByMag[magasin] ?? 0,
    }));
    if (caMonthRows.length) {
      const { error } = await supabase.from("ca_month").upsert(caMonthRows);
      if (error) throw new Error(error.message);
    }

    const { error: delHourErr } = await supabase.from("ca_panier_hour").delete().eq("date", date);
    if (delHourErr) throw new Error(delHourErr.message);

    const hourRows: Array<{ date: string; magasin: string; hour: number; nb: number }> = [];
    for (const [magasin, buckets] of Object.entries(panierHeureByMag)) {
      buckets.forEach((nb, hour) => {
        if (nb > 0) hourRows.push({ date, magasin, hour, nb });
      });
    }
    if (hourRows.length) {
      const { error: hourErr } = await supabase.from("ca_panier_hour").insert(hourRows);
      if (hourErr) throw new Error(hourErr.message);
    }

    const { error: delProdErr } = await supabase.from("ca_product_day").delete().eq("date", date);
    if (delProdErr) throw new Error(delProdErr.message);

    const prodRows: Array<{ date: string; magasin: string; article: string; qty: number; total: number }> = [];
    for (const [magasin, map] of productByMag) {
      const magCode = normalizeMagasinCode(magasin);
      if (!magCode) continue;
      for (const [article, v] of map) {
        const name = article.trim();
        if (!name) continue;
        prodRows.push({ date, magasin: magCode, article: name, qty: v.qty, total: v.total });
      }
    }
    if (prodRows.length) {
      const { error } = await supabase.from("ca_product_day").upsert(prodRows, {
        onConflict: "date,magasin,article",
      });
      if (error) throw new Error(error.message);
    }

    return {
      date,
      ym,
      written: {
        ca_day: caDayRows.length,
        ca_month: caMonthRows.length,
        ca_product_day: prodRows.length,
        ca_panier_hour: hourRows.length,
      },
    };
  } finally {
    ftp.close();
  }
}

