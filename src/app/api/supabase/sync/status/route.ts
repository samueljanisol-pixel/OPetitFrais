import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Évite un cache CDN / route en prod qui renverrait toujours une réponse vide ou périmée. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("sync_runs")
      .select("started_at, finished_at, status, message, last_synced_date, processed_days")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(
      { last: data?.[0] ?? null },
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

