import { Client } from "basic-ftp";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const asNumber = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const pickString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

function extractProductLines(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const ventes = root["ventes"];
  if (!ventes || typeof ventes !== "object" || Array.isArray(ventes)) return [];
  const out: Array<{ article: string; qty: number; total: number }> = [];
  for (const v of Object.values(ventes as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const article = pickString(r.article) || pickString(r.libelle) || pickString(r.designation) || pickString(r.name);
    if (!article) continue;
    const qty = asNumber(r.qte) || asNumber(r.qty) || asNumber(r.quantite) || asNumber(r.quantity);
    const total = asNumber(r.total) || asNumber(r.montant) || asNumber(r.ca) || asNumber(r.amount) || asNumber(r.total_ttc);
    if (qty === 0 && total === 0) continue;
    out.push({ article, qty, total });
  }
  return out;
}

export async function syncDateToSupabase(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date invalide (YYYY-MM-DD)");

  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  if (!host || !user || !password) throw new Error("FTP non configuré (FTP_HOST/FTP_USER/FTP_PASSWORD)");

  const ym = date.slice(0, 7);
  const monthFileName = `ventes_${ym}.json`;

  const ftp = new Client();
  try {
    await ftp.access({ host, user, password, secure: false });
    const magasinsAll = await ftp.list("/ventes");
    const magasins = magasinsAll.filter((m) => m.isDirectory && m.name !== "M00");

    const dayByMagasin: Record<string, number> = {};
    const monthByMagasin: Record<string, number> = {};
    const productAgg = new Map<string, { qty: number; total: number }>();

    for (const mag of magasins) {
      const magasinPath = `/ventes/${mag.name}`;
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

          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }

          if (isDay) {
            const tj = parsed && typeof parsed.total_jour === "number" ? parsed.total_jour : 0;
            dayByMagasin[mag.name] = (dayByMagasin[mag.name] ?? 0) + tj;

            const lines = extractProductLines(parsed);
            for (const l of lines) {
              const prev = productAgg.get(l.article) ?? { qty: 0, total: 0 };
              productAgg.set(l.article, { qty: prev.qty + l.qty, total: prev.total + l.total });
            }
          } else if (isMonth) {
            const lines = extractProductLines(parsed);
            if (lines.length) {
              const sum = lines.reduce((acc, l) => acc + l.total, 0);
              monthByMagasin[mag.name] = (monthByMagasin[mag.name] ?? 0) + sum;
            }
          }
        }
      }
    }

    const supabase = createSupabaseServiceRoleClient();

    const caDayRows = Object.entries(dayByMagasin).map(([magasin, total]) => ({ date, magasin, total }));
    if (caDayRows.length) {
      const { error } = await supabase.from("ca_day").upsert(caDayRows);
      if (error) throw new Error(error.message);
    }

    const caMonthRows = Object.entries(monthByMagasin).map(([magasin, total]) => ({ ym, magasin, total }));
    if (caMonthRows.length) {
      const { error } = await supabase.from("ca_month").upsert(caMonthRows);
      if (error) throw new Error(error.message);
    }

    const prodRows = Array.from(productAgg.entries()).map(([article, v]) => ({
      date,
      article,
      qty: v.qty,
      total: v.total,
    }));
    if (prodRows.length) {
      const { error } = await supabase.from("ca_product_day").upsert(prodRows);
      if (error) throw new Error(error.message);
    }

    return {
      date,
      ym,
      written: { ca_day: caDayRows.length, ca_month: caMonthRows.length, ca_product_day: prodRows.length },
    };
  } finally {
    ftp.close();
  }
}

