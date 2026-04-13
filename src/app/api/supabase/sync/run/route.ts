import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { syncDateToSupabase } from "@/lib/sync/ftpToSupabase";

function isoTodayUtc() {
  return new Date().toISOString().split("T")[0];
}

function addDaysIso(iso: string, days: number) {
  const [yy, mm, dd] = iso.split("-").map((x) => Number(x));
  if (!yy || !mm || !dd) return iso;
  const t = Date.UTC(yy, mm - 1, dd) + days * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET || process.env.SYNC_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const today = isoTodayUtc();
  const maxDaysPerRun = Math.max(1, Number(process.env.MAX_SYNC_DAYS_PER_RUN ?? 3));

  const startedAt = new Date().toISOString();
  let lastSyncedDate: string | null = null;
  let processedDays = 0;
  let status: "success" | "error" = "success";
  let message: string | null = null;

  // Dernière synchro OK (date maximale traitée)
  const { data: last } = await supabase
    .from("sync_runs")
    .select("last_synced_date, finished_at")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1);

  const lastDate = last?.[0]?.last_synced_date ? String(last[0].last_synced_date) : null;

  // Définir la plage à rattraper
  const start = lastDate ? addDaysIso(lastDate, 1) : `${today.slice(0, 4)}-01-01`;
  const end = today;

  try {
    // Si on est déjà à jour, on resync aujourd'hui pour capter les ventes tardives
    const dates: string[] = [];
    if (lastDate && lastDate >= end) {
      dates.push(end);
    } else {
      let cur = start;
      while (cur <= end) {
        dates.push(cur);
        cur = addDaysIso(cur, 1);
      }
    }

    for (const d of dates) {
      await syncDateToSupabase(d);
      processedDays += 1;
      lastSyncedDate = d;
      if (processedDays >= maxDaysPerRun) {
        message = `Traitement partiel: ${processedDays}/${dates.length} jour(s). Le cron continuera au prochain run.`;
        break;
      }
    }
  } catch (e) {
    status = "error";
    message = e instanceof Error ? e.message : "Erreur";
  }

  const finishedAt = new Date().toISOString();
  await supabase.from("sync_runs").insert({
    started_at: startedAt,
    finished_at: finishedAt,
    status,
    message,
    last_synced_date: lastSyncedDate,
    processed_days: processedDays,
  });

  if (status === "error") {
    return NextResponse.json(
      { ok: false, status, message, processedDays, lastSyncedDate },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status, processedDays, lastSyncedDate });
}

