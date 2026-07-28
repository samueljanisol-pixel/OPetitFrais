import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { loadEmballagesConsommablesSupplierId } from "@/lib/emballages/supplier-api";

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

  const supplierId = await loadEmballagesConsommablesSupplierId(service);
  if (!supplierId) {
    return NextResponse.json({ vendeurs: [] });
  }

  const { data, error } = await service
    .from("ref_supplier_vendeur")
    .select("id, label, supplier_id, sort_order")
    .eq("supplier_id", supplierId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vendeurs: data ?? [] });
}
