import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { loadSalariesSites } from "@/lib/salaries/sites";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const gate = await requireApiPermission("salaries.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const sites = await loadSalariesSites(service);
  return NextResponse.json({ sites });
}
