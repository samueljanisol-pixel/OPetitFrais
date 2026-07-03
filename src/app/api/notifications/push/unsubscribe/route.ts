import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/notifications/require-auth";

export async function DELETE(req: Request) {
  const gate = await requireAuthenticatedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint");

  const supabase = await createSupabaseServerClient();

  if (endpoint) {
    const { error } = await supabase
      .from("user_push_subscriptions")
      .delete()
      .eq("user_id", gate.userId)
      .eq("endpoint", endpoint);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("user_push_subscriptions")
      .delete()
      .eq("user_id", gate.userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
