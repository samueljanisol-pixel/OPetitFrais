import { Client } from "basic-ftp";
import type { NextRequest } from "next/server";
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

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;

  if (!host || !user || !password) {
    return new Response(sseEvent("error", { error: "FTP non configuré (FTP_HOST/FTP_USER/FTP_PASSWORD)" }), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const today = isoTodayUtc();
  const from =
    searchParams.get("from") && isIsoDate(searchParams.get("from")!)
      ? searchParams.get("from")!
      : `${today.slice(0, 4)}-01-01`;
  const to = searchParams.get("to") && isIsoDate(searchParams.get("to")!) ? searchParams.get("to")! : today;

  const range = clampIsoRange(from, to);
  if (!range) {
    return new Response(sseEvent("error", { error: "Période invalide (from/to)" }), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const client = new Client();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(enc.encode(sseEvent(event, data)));
      };

      const run = async () => {
        try {
          send("progress", { phase: "Connexion FTP", current: 0, total: 1 });
          await client.access({ host, user, password, secure: false });

          send("progress", { phase: "Liste des magasins", current: 0, total: 1 });
          const magasinsAll = await client.list("/ventes");
          const magasins = magasinsAll.filter((m) => m.isDirectory && m.name !== "M00");

          // Plan des caisses pour progression
          send("progress", { phase: "Préparation", current: 0, total: 1 });
          const plan: Array<{ mag: string; caissePath: string }> = [];
          for (const mag of magasins) {
            const magasinPath = `/ventes/${mag.name}`;
            const caisses = await client.list(magasinPath);
            for (const c of caisses) {
              if (!c.isDirectory) continue;
              plan.push({ mag: mag.name, caissePath: `${magasinPath}/${c.name}` });
            }
          }

          const totalSteps = plan.length || 1;
          let doneSteps = 0;

          const dayTotals = new Map<string, { totalGlobal: number; magasins: Record<string, number> }>();

          for (const item of plan) {
            send("progress", { phase: `Scan ${item.mag}`, current: doneSteps, total: totalSteps });
            const files = await client.list(item.caissePath);
            for (const file of files) {
              if (!file.name) continue;
              const iso = extractIsoFromFilename(file.name);
              if (!iso) continue;
              const ms = parseIsoDateToUtcMs(iso);
              if (ms === null) continue;
              if (ms < range.fromMs || ms > range.toMs) continue;

              const tempFile = path.join(os.tmpdir(), file.name);
              await client.downloadTo(tempFile, `${item.caissePath}/${file.name}`);
              const raw = await fs.readFile(tempFile, "utf8");
              await fs.unlink(tempFile).catch(() => {});

              let totalJour = 0;
              try {
                const data = JSON.parse(raw) as { total_jour?: number };
                totalJour = typeof data.total_jour === "number" ? data.total_jour : 0;
              } catch {
                totalJour = 0;
              }

              if (!dayTotals.has(iso)) dayTotals.set(iso, { totalGlobal: 0, magasins: {} });
              const entry = dayTotals.get(iso)!;
              entry.totalGlobal += totalJour;
              entry.magasins[item.mag] = (entry.magasins[item.mag] ?? 0) + totalJour;
            }

            doneSteps += 1;
            send("progress", { phase: "Traitement en cours", current: doneSteps, total: totalSteps });
          }

          const days = Array.from(dayTotals.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, v]) => ({ date, totalGlobal: v.totalGlobal, magasins: v.magasins }));

          send("done", { from, to, days });
        } catch (e) {
          send("error", { error: e instanceof Error ? e.message : "Erreur" });
        } finally {
          client.close();
          closed = true;
          controller.close();
        }
      };

      const ping = setInterval(() => {
        try {
          send("ping", { t: Date.now() });
        } catch {}
      }, 15000);

      run().finally(() => clearInterval(ping));
    },
    cancel() {
      client.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

