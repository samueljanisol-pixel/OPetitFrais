import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";

export async function GET() {
  const gate = await requireAnyApiPermission([
    "commandes_fournisseur.comptes",
    "parametres.read",
    "parametres.write",
  ]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ref_payment_method")
    .select("id, code, label, label_ar, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ methods: data ?? [] });
}
