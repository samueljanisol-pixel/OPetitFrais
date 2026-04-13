import { Client } from "basic-ftp";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

export const runtime = "nodejs";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isoDateMinusDays(iso: string, days: number) {
  // Important: calcul en UTC pour éviter les décalages liés au fuseau horaire
  // quand on convertit en ISO (ex: Europe/Paris → jour -1).
  const [yy, mm, dd] = iso.split("-").map((x) => Number(x));
  if (!yy || !mm || !dd) return iso;
  const t = Date.UTC(yy, mm - 1, dd) - days * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ProductAgg = {
  name: string;
  ca: number;
  qty: number;
};

function asNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickString(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function extractProductLines(payload: unknown): Array<{ name: string; ca: number; qty: number }> {
  // Heuristique: on essaie de trouver des lignes produits dans des structures fréquentes,
  // sans connaître le format exact des JSON FTP.
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const candidates: unknown[] = [];

  const directKeys = ["produits", "products", "articles", "items", "lignes", "lines", "details", "detail"];
  for (const k of directKeys) {
    const v = root[k];
    if (Array.isArray(v)) candidates.push(v);
  }

  // Cherche aussi dans des sous-objets courants
  const nestedKeys = ["data", "vente", "ventes", "journal", "ticket", "tickets", "rapport", "report"];
  for (const nk of nestedKeys) {
    const nv = root[nk];
    if (nv && typeof nv === "object") {
      for (const k of directKeys) {
        const v = (nv as Record<string, unknown>)[k];
        if (Array.isArray(v)) candidates.push(v);
      }
    }
  }

  const out: Array<{ name: string; ca: number; qty: number }> = [];

  // Format connu (exemple fourni): { ventes: { "89": { article, qte, total }, ... } }
  const ventes = root["ventes"];
  if (ventes && typeof ventes === "object" && !Array.isArray(ventes)) {
    for (const v of Object.values(ventes as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      const name = pickString(r.article) || pickString(r.libelle) || pickString(r.designation) || pickString(r.name);
      const qty = asNumber(r.qte) || asNumber(r.qty) || asNumber(r.quantite) || asNumber(r.quantity);
      const ca = asNumber(r.total) || asNumber(r.ca) || asNumber(r.montant) || asNumber(r.amount) || asNumber(r.total_ttc);
      if (!name) continue;
      if (qty === 0 && ca === 0) continue;
      out.push({ name, ca, qty });
    }
  }

  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    for (const row of c) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name =
        pickString(r.libelle) ||
        pickString(r.designation) ||
        pickString(r.name) ||
        pickString(r.produit) ||
        pickString(r.article) ||
        pickString(r.label) ||
        pickString(r.desc) ||
        pickString(r.description);

      const qty =
        asNumber(r.qte) ||
        asNumber(r.qty) ||
        asNumber(r.quantite) ||
        asNumber(r.quantity) ||
        asNumber(r.nb) ||
        asNumber(r.nombre);

      const ca =
        asNumber(r.ca) ||
        asNumber(r.montant) ||
        asNumber(r.amount) ||
        asNumber(r.total) ||
        asNumber(r.total_ttc) ||
        asNumber(r.prix_total);

      if (!name) continue;
      if (qty === 0 && ca === 0) continue;
      out.push({ name, ca, qty });
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;

  if (!host || !user || !password) {
    return NextResponse.json(
      { error: "FTP non configuré (FTP_HOST/FTP_USER/FTP_PASSWORD)" },
      { status: 500 },
    );
  }

  const client = new Client();

  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
    const ym = date.slice(0, 7); // YYYY-MM
    const monthFileName = `ventes_${ym}.json`;
    const includeCompare = searchParams.get("includeCompare") === "1";
    const includeTop = searchParams.get("includeTop") === "1";
    const dateJ1 = isoDateMinusDays(date, 1);
    // Demande métier: comparer au même jour de semaine (J-8)
    // Ajustement demandé: encore 1 jour en moins tout en gardant l'affichage "J-8"
    const dateJ7 = isoDateMinusDays(date, 7);

    await client.access({
      host,
      user,
      password,
      secure: false,
    });

    const magasins = await client.list("/ventes");

    const result: Record<string, Record<string, number>> = {};
    let totalGlobal = 0;
    let totalJ1 = 0;
    let totalJ7 = 0;

    const monthByMagasin: Record<string, number> = {};
    let monthTotalGlobal = 0;

    const productAgg = new Map<string, { ca: number; qty: number }>();
    let sawAnyProductLine = false;

    for (const magasin of magasins) {
      if (!magasin.isDirectory) continue;
      if (magasin.name === "M00") continue;

      const magasinPath = `/ventes/${magasin.name}`;
      const caisses = await client.list(magasinPath);

      let totalMagasin = 0;
      let monthTotalMagasin = 0;
      result[magasin.name] = {};

      for (const caisse of caisses) {
        if (!caisse.isDirectory) continue;

        const caissePath = `${magasinPath}/${caisse.name}`;
        const files = await client.list(caissePath);

        let totalCaisse = 0;
        let monthTotalCaisse = 0;

        for (const file of files) {
          const isDate = file.name.includes(date);
          const isJ1 = includeCompare && file.name.includes(dateJ1);
          const isJ7 = includeCompare && file.name.includes(dateJ7);
          const isMonth = file.name === monthFileName;
          if (!isDate && !isJ1 && !isJ7 && !isMonth) continue;

          const tempFile = path.join(os.tmpdir(), file.name);
          await client.downloadTo(tempFile, `${caissePath}/${file.name}`);

          const raw = await fs.readFile(tempFile, "utf8");
          const data = JSON.parse(raw) as { total_jour?: number };
          await fs.unlink(tempFile).catch(() => {});

          const tj = data.total_jour ?? 0;
          if (isDate) {
            totalCaisse += tj;
            if (includeTop) {
              const lines = extractProductLines(data);
              if (lines.length) sawAnyProductLine = true;
              for (const l of lines) {
                const prev = productAgg.get(l.name) ?? { ca: 0, qty: 0 };
                productAgg.set(l.name, { ca: prev.ca + l.ca, qty: prev.qty + l.qty });
              }
            }
          } else if (isMonth) {
            const lines = extractProductLines(data);
            if (lines.length) {
              monthTotalCaisse += lines.reduce((acc, l) => acc + (Number.isFinite(l.ca) ? l.ca : 0), 0);
            }
          } else if (isJ1) {
            totalJ1 += tj;
          } else if (isJ7) {
            totalJ7 += tj;
          }
        }

        result[magasin.name][caisse.name] = totalCaisse;
        totalMagasin += totalCaisse;
        monthTotalMagasin += monthTotalCaisse;
      }

      result[magasin.name]["total"] = totalMagasin;
      totalGlobal += totalMagasin;
      monthByMagasin[magasin.name] = monthTotalMagasin;
      monthTotalGlobal += monthTotalMagasin;
    }

    return NextResponse.json({
      totalGlobal,
      magasins: result,
      month: {
        ym,
        totalGlobal: monthTotalGlobal,
        magasins: monthByMagasin,
      },
      ...(includeCompare
        ? {
            compare: {
              date,
              j1: { date: dateJ1, totalGlobal: totalJ1 },
              j7: { date: dateJ7, totalGlobal: totalJ7 },
            },
          }
        : {}),
      ...(includeTop
        ? {
            topProduits: (() => {
              const rows: ProductAgg[] = [];
              for (const [name, v] of productAgg.entries()) rows.push({ name, ca: v.ca, qty: v.qty });
              const byCa = [...rows].sort((a, b) => b.ca - a.ca).slice(0, 10);
              const byQty = [...rows].sort((a, b) => b.qty - a.qty).slice(0, 10);
              return { available: sawAnyProductLine, byCa, byQty };
            })(),
          }
        : {}),
    });
  } catch {
    return NextResponse.json({ error: "Erreur FTP" }, { status: 500 });
  } finally {
    client.close();
  }
}
