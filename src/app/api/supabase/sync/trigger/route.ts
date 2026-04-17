import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeScheduledFtpSync } from "@/lib/sync/scheduledFtpSync";

/** POST : lance la même synchro que `/api/supabase/sync/run`, réservé aux utilisateurs connectés. */
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
    }

    const result = await executeScheduledFtpSync();

    if (result.insertError) {
      return NextResponse.json(
        {
          ok: false,
          status: "error" as const,
          message: result.message,
          processedDays: result.processedDays,
          lastSyncedDate: result.lastSyncedDate,
        },
        { status: 500 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          message: result.message,
          processedDays: result.processedDays,
          lastSyncedDate: result.lastSyncedDate,
          syncRunId: result.syncRunId,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      processedDays: result.processedDays,
      lastSyncedDate: result.lastSyncedDate,
      syncRunId: result.syncRunId ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 },
    );
  }
}
