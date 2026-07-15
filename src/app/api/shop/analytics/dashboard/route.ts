import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { fetchShopAnalyticsDashboard } from "@/lib/shop/analytics-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const gate = await requireApiPermission("shop.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : 30;

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await fetchShopAnalyticsDashboard(supabase, days);

  if (error || !data) {
    return NextResponse.json({ error: error ?? "Erreur inconnue" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
