import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function GET() {
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ref_supplier")
    .select("id, code, label, sort_order, commande_active")
    .eq("commande_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suppliers: data ?? [] });
}
