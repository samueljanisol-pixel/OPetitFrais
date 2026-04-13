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

function parseIsoDateToUtcMs(iso: string) {
  const [yy, mm, dd] = iso.split("-").map((x) => Number(x));
  if (!yy || !mm || !dd) return null;
  return Date.UTC(yy, mm - 1, dd);
}

function isoTodayUtc() {
  return new Date().toISOString().split("T")[0];
}

function clampIsoRange(fromIso: string, toIso: string) {
  const fromMs = parseIsoDateToUtcMs(fromIso);
  const toMs = parseIsoDateToUtcMs(toIso);
  if (fromMs === null || toMs === null) return null;
  if (fromMs > toMs) return null;
  return { fromMs, toMs };
}

function extractIsoFromFilename(name: string) {
  const m = name.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
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

  const { searchParams } = new URL(req.url);
  const today = isoTodayUtc();
  const from = searchParams.get("from") && isIsoDate(searchParams.get("from")!) ? searchParams.get("from")! : `${today.slice(0, 4)}-01-01`;
  const to = searchParams.get("to") && isIsoDate(searchParams.get("to")!) ? searchParams.get("to")! : today;

  const range = clampIsoRange(from, to);
  if (!range) {
    return NextResponse.json({ error: "Période invalide (from/to)" }, { status: 400 });
  }

  const client = new Client();
  try {
    await client.access({
      host,
      user,
      password,
      secure: false,
    });

    const magasins = await client.list("/ventes");

    // dayTotals[YYYY-MM-DD] = { totalGlobal, magasins: { M01: n, ... } }
    const dayTotals = new Map<string, { totalGlobal: number; magasins: Record<string, number> }>();

    for (const magasin of magasins) {
      if (!magasin.isDirectory) continue;
      if (magasin.name === "M00") continue;

      const magasinPath = `/ventes/${magasin.name}`;
      const caisses = await client.list(magasinPath);

      for (const caisse of caisses) {
        if (!caisse.isDirectory) continue;

        const caissePath = `${magasinPath}/${caisse.name}`;
        const files = await client.list(caissePath);

        for (const file of files) {
          if (!file.name) continue;
          const iso = extractIsoFromFilename(file.name);
          if (!iso) continue;

          const ms = parseIsoDateToUtcMs(iso);
          if (ms === null) continue;
          if (ms < range.fromMs || ms > range.toMs) continue;

          const tempFile = path.join(os.tmpdir(), file.name);
          await client.downloadTo(tempFile, `${caissePath}/${file.name}`);

          const raw = await fs.readFile(tempFile, "utf8");
          await fs.unlink(tempFile).catch(() => {});

          let totalJour = 0;
          try {
            const data = JSON.parse(raw) as { total_jour?: number };
            totalJour = typeof data.total_jour === "number" ? data.total_jour : 0;
          } catch {
            totalJour = 0;
          }

          if (!dayTotals.has(iso)) {
            dayTotals.set(iso, { totalGlobal: 0, magasins: {} });
          }
          const entry = dayTotals.get(iso)!;
          entry.totalGlobal += totalJour;
          entry.magasins[magasin.name] = (entry.magasins[magasin.name] ?? 0) + totalJour;
        }
      }
    }

    const days = Array.from(dayTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        totalGlobal: v.totalGlobal,
        magasins: v.magasins,
      }));

    return NextResponse.json({ from, to, days });
  } catch {
    return NextResponse.json({ error: "Erreur FTP" }, { status: 500 });
  } finally {
    client.close();
  }
}

