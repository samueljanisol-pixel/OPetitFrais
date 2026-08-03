import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientRead } from "@/lib/commandes-client/api-auth";
import { listWorkflowLog } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientRead();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw))) : 50;

  const supabase = await createSupabaseServerClient();
  const { entries, error } = await listWorkflowLog(supabase, id.trim(), limit);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ log: entries });
}
