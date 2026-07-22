import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { executeAutomatedTask, loadTaskByCode } from "@/lib/automated-tasks";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const gate = verifyCronSecret(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: m }, { status: 503 });
  }

  const task = await loadTaskByCode(supabase, "ftp_sync");
  if (!task) {
    return NextResponse.json(
      { error: "Tâche ftp_sync introuvable (migration automated_tasks ?)" },
      { status: 503 },
    );
  }

  try {
    const outcome = await executeAutomatedTask(supabase, task, { force: true });
    const result = outcome.result;
    if (!outcome.skipped && result && !result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "error",
          message: result.message,
          processedDays: result.stats.processedDays ?? 0,
          lastSyncedDate: result.stats.lastSyncedDate ?? null,
          syncRunId: result.stats.syncRunId ?? null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: "success",
      processedDays: result?.stats.processedDays ?? 0,
      lastSyncedDate: result?.stats.lastSyncedDate ?? null,
      syncRunId: result?.stats.syncRunId ?? null,
      outcome,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, status: "error", message: m }, { status: 500 });
  }
}
