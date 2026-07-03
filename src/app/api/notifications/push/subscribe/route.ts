import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/notifications/require-auth";

export async function POST(req: Request) {
  const gate = await requireAuthenticatedUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const authKey = body.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Abonnement push incomplet" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_push_subscriptions").upsert(
    {
      user_id: gate.userId,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: userAgent,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
