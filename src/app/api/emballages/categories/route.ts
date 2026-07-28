import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { parseEmballageCategorieRow } from "@/lib/emballages/emballage-api";

export async function GET() {
  const gate = await requireAnyApiPermission(["emballages.read", "emballages.write"]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data, error } = await service
    .from("ref_emballage_categorie")
    .select("id, code, label, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    categories: (data ?? []).map((r) => parseEmballageCategorieRow(r as Record<string, unknown>)),
  });
}
