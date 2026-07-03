import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/notifications/require-auth";
import type { UserNotificationRow } from "@/lib/notifications/types";

export async function GET(req: Request) {
  const gate = await requireAuthenticatedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 50);

  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("user_notifications")
    .select("id, type_key, title, body, link_url, payload, read_at, created_at", { count: "exact" })
    .eq("user_id", gate.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: unreadCount, error: unreadErr } = await supabase
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", gate.userId)
    .is("read_at", null);

  if (unreadErr) {
    return NextResponse.json({ error: unreadErr.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: (data ?? []) as UserNotificationRow[],
    unreadCount: unreadCount ?? 0,
    total: count ?? 0,
  });
}
