import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { loadUnlinkedPaniers } from "@/lib/clients/compte-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const gate = await requireApiPermission("clients.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const result = await loadUnlinkedPaniers(supabase);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ paniers: result.paniers });
}
