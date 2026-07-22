import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Évite un cache CDN / route en prod qui renverrait toujours une réponse vide ou périmée. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SyncRunPayload = {
  started_at: string;
  finished_at: string | null;
  status: "success" | "error";
  message: string | null;
  last_synced_date: string | null;
  processed_days: number;
};

function statsNumber(stats: Record<string, unknown> | null | undefined, key: string): number {
  const v = stats?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function statsString(stats: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = stats?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function lastFtpRunFromAutomatedTasks(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
): Promise<SyncRunPayload | null> {
  const { data: task } = await supabase
    .from("automated_tasks")
    .select("id")
    .eq("code", "ftp_sync")
    .maybeSingle();

  const taskId = (task as { id?: string } | null)?.id;
  if (!taskId) return null;

  const { data: run } = await supabase
    .from("automated_task_runs")
    .select("started_at, finished_at, status, message, stats")
    .eq("task_id", taskId)
    .neq("status", "running")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!run) return null;

  const row = run as {
    started_at: string;
    finished_at: string | null;
    status: string;
    message: string | null;
    stats: Record<string, unknown> | null;
  };

  if (row.status !== "success" && row.status !== "error") return null;

  return {
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status,
    message: row.message,
    last_synced_date: statsString(row.stats, "lastSyncedDate"),
    processed_days: statsNumber(row.stats, "processedDays"),
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseServiceRoleClient();

    const automatedLast = await lastFtpRunFromAutomatedTasks(supabase);
    if (automatedLast) {
      return NextResponse.json(
        { last: automatedLast, source: "automated_task_runs" },
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    }

    const { data, error } = await supabase
      .from("sync_runs")
      .select("started_at, finished_at, status, message, last_synced_date, processed_days")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(
      { last: data?.[0] ?? null, source: "sync_runs" },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 },
    );
  }
}
