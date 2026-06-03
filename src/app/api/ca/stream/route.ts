import { Client } from "basic-ftp";
import type { NextRequest } from "next/server";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { extractProductLines } from "@/lib/ventesJson";

export const runtime = "nodejs";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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

type ProductAgg = { name: string; ca: number; qty: number };

function asNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickString(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

/** Nombre de paniers / tickets en tête de fichier JSON (jour ou mois). */
function extractNbPaniers(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0;
  const r = parsed as Record<string, unknown>;
  const n =
    asNumber(r.nb_paniers) ||
    asNumber(r.nbPaniers) ||
    asNumber(r.nombre_paniers) ||
    asNumber(r.NbrPanier) ||
    asNumber(r.nbr_panier);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type PanierMag = { nbPaniers: number; panierMoyen: number | null };

function buildPanierForMags(
  mags: string[],
  caByMag: Record<string, number>,
  nbByMag: Record<string, number>,
): Record<string, PanierMag> {
  const out: Record<string, PanierMag> = {};
  for (const mag of mags) {
    const nb = nbByMag[mag] ?? 0;
    const ca = caByMag[mag] ?? 0;
    out[mag] = { nbPaniers: nb, panierMoyen: nb > 0 ? ca / nb : null };
  }
  return out;
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
  const dateParam = searchParams.get("date");
  const today = new Date().toISOString().split("T")[0];
  const date = dateParam && isIsoDate(dateParam) ? dateParam : today;
  const ym = date.slice(0, 7);
  const monthFileName = `ventes_${ym}.json`;
  const includeCompare = searchParams.get("includeCompare") === "1";
  const includeTop = searchParams.get("includeTop") === "1";
  const dateJ1 = isoDateMinusDays(date, 1);
  const dateJ7 = isoDateMinusDays(date, 7);

  const client = new Client();
  /** Partagé avec `cancel` : le client peut fermer le flux avant la fin du traitement FTP. */
  const streamState = { closed: false };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (streamState.closed) return;
        try {
          controller.enqueue(enc.encode(sseEvent(event, data)));
        } catch {
          streamState.closed = true;
        }
      };

      const run = async () => {
        try {
          send("progress", { phase: "Connexion FTP", current: 0, total: 1 });
          await client.access({ host, user, password, secure: false });

          send("progress", { phase: "Liste des magasins", current: 0, total: 1 });
          const magasinsAll = await client.list("/ventes");
          const magasins = magasinsAll.filter((m) => m.isDirectory && m.name !== "M00");

          // Pré-calc des caisses pour avoir un total d'étapes "utiles"
          send("progress", { phase: "Préparation", current: 0, total: 1 });
          const plan: Array<{ mag: string; caisse: string; caissePath: string }> = [];
          for (const mag of magasins) {
            const magasinPath = `/ventes/${mag.name}`;
            const caisses = await client.list(magasinPath);
            for (const c of caisses) {
              if (!c.isDirectory) continue;
              const caissePath = `${magasinPath}/${c.name}`;
              plan.push({ mag: mag.name, caisse: c.name, caissePath });
            }
          }

          const totalSteps = plan.length || 1;
          let doneSteps = 0;

          const result: Record<string, Record<string, number>> = {};
          let totalGlobal = 0;
          let totalJ1 = 0;
          let totalJ7 = 0;

          const monthByMagasin: Record<string, number> = {};
          let monthTotalGlobal = 0;

          const productAgg = new Map<string, { ca: number; qty: number }>();
          let sawAnyProductLine = false;

          // init magasins in result
          for (const mag of magasins) result[mag.name] = {};

          // Par magasin, on cumulera
          const dayByMag: Record<string, number> = {};
          const paniersJourByMag: Record<string, number> = {};
          const paniersMoisByMag: Record<string, number> = {};

          for (const item of plan) {
            send("progress", {
              phase: `Traitement ${item.mag}/${item.caisse}`,
              current: doneSteps,
              total: totalSteps,
            });

            const files = await client.list(item.caissePath);
            let totalCaisse = 0;
            let monthTotalCaisse = 0;

            for (const file of files) {
              const isDate = file.name.includes(date);
              const isJ1 = includeCompare && file.name.includes(dateJ1);
              const isJ7 = includeCompare && file.name.includes(dateJ7);
              const isMonth = file.name === monthFileName;
              if (!isDate && !isJ1 && !isJ7 && !isMonth) continue;

              const tempFile = path.join(os.tmpdir(), file.name);
              await client.downloadTo(tempFile, `${item.caissePath}/${file.name}`);

              const raw = await fs.readFile(tempFile, "utf8");
              await fs.unlink(tempFile).catch(() => {});

              let parsed: unknown = null;
              try {
                parsed = JSON.parse(raw) as unknown;
              } catch {
                parsed = null;
              }

              const tj =
                parsed && typeof parsed === "object" && "total_jour" in (parsed as Record<string, unknown>)
                  ? asNumber((parsed as Record<string, unknown>).total_jour)
                  : 0;
              if (isDate) {
                totalCaisse += tj;
                const nbPan = extractNbPaniers(parsed);
                paniersJourByMag[item.mag] = (paniersJourByMag[item.mag] ?? 0) + nbPan;
                if (includeTop) {
                  const lines = extractProductLines(parsed);
                  if (lines.length) sawAnyProductLine = true;
                  for (const l of lines) {
                    const prev = productAgg.get(l.name) ?? { ca: 0, qty: 0 };
                    productAgg.set(l.name, { ca: prev.ca + l.ca, qty: prev.qty + l.qty });
                  }
                }
              } else if (isMonth) {
                const nbPanMois = extractNbPaniers(parsed);
                paniersMoisByMag[item.mag] = (paniersMoisByMag[item.mag] ?? 0) + nbPanMois;
                const lines = extractProductLines(parsed);
                if (lines.length) monthTotalCaisse += lines.reduce((acc, l) => acc + (Number.isFinite(l.ca) ? l.ca : 0), 0);
              } else if (isJ1) {
                totalJ1 += tj;
              } else if (isJ7) {
                totalJ7 += tj;
              }
            }

            result[item.mag][item.caisse] = totalCaisse;
            dayByMag[item.mag] = (dayByMag[item.mag] ?? 0) + totalCaisse;
            monthByMagasin[item.mag] = (monthByMagasin[item.mag] ?? 0) + monthTotalCaisse;

            doneSteps += 1;
            send("progress", { phase: "Traitement en cours", current: doneSteps, total: totalSteps });
          }

          // Finalisation totaux
          for (const mag of Object.keys(result)) {
            const totalMag = dayByMag[mag] ?? 0;
            result[mag]["total"] = totalMag;
            totalGlobal += totalMag;
          }
          for (const mag of Object.keys(monthByMagasin)) {
            monthTotalGlobal += monthByMagasin[mag] ?? 0;
          }

          const panierJour = buildPanierForMags(Object.keys(result), dayByMag, paniersJourByMag);
          let nbPaniersJourGlobal = 0;
          for (const v of Object.values(panierJour)) nbPaniersJourGlobal += v.nbPaniers;
          const panierJourGlobal: PanierMag = {
            nbPaniers: nbPaniersJourGlobal,
            panierMoyen: nbPaniersJourGlobal > 0 ? totalGlobal / nbPaniersJourGlobal : null,
          };

          const panierMois = buildPanierForMags(Object.keys(result), monthByMagasin, paniersMoisByMag);
          let nbPaniersMoisGlobal = 0;
          for (const v of Object.values(panierMois)) nbPaniersMoisGlobal += v.nbPaniers;
          const panierMoisGlobal: PanierMag = {
            nbPaniers: nbPaniersMoisGlobal,
            panierMoyen: nbPaniersMoisGlobal > 0 ? monthTotalGlobal / nbPaniersMoisGlobal : null,
          };

          const payload: Record<string, unknown> = {
            totalGlobal,
            magasins: result,
            month: {
              ym,
              totalGlobal: monthTotalGlobal,
              magasins: monthByMagasin,
              panierMois,
              panierMoisGlobal,
            },
            panierJour,
            panierJourGlobal,
            ...(includeCompare ? { compare: { date, j1: { date: dateJ1, totalGlobal: totalJ1 }, j7: { date: dateJ7, totalGlobal: totalJ7 } } } : {}),
          };

          if (includeTop) {
            const rows: ProductAgg[] = [];
            for (const [name, v] of productAgg.entries()) rows.push({ name, ca: v.ca, qty: v.qty });
            payload.topProduits = {
              available: sawAnyProductLine,
              byCa: [...rows].sort((a, b) => b.ca - a.ca).slice(0, 10),
              byQty: [...rows].sort((a, b) => b.qty - a.qty).slice(0, 10),
            };
          }

          send("progress", { phase: "Terminé", current: totalSteps, total: totalSteps });
          send("done", payload);
        } catch (e) {
          try {
            send("error", { error: e instanceof Error ? e.message : "Erreur" });
          } catch {
            /* flux déjà fermé côté client */
          }
        } finally {
          client.close();
          streamState.closed = true;
          try {
            controller.close();
          } catch {
            /* ReadableStreamDefaultController déjà fermé (abort / fin doublon) */
          }
        }
      };

      // Ping pour garder la connexion
      const ping = setInterval(() => {
        try {
          send("ping", { t: Date.now() });
        } catch {
          // ignore
        }
      }, 15000);

      run().finally(() => clearInterval(ping));
    },
    cancel() {
      streamState.closed = true;
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

