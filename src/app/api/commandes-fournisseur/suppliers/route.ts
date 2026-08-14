import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { supplierUsesDeliveryDate } from "@/lib/commandes-fournisseur/delivery-date";

export async function GET() {
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const [suppliersRes, vendeursRes] = await Promise.all([
    supabase
      .from("ref_supplier")
      .select("id, code, label, sort_order, commande_active")
      .eq("commande_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("ref_supplier_vendeur").select("supplier_id"),
  ]);

  if (suppliersRes.error) {
    return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 });
  }
  if (vendeursRes.error) {
    return NextResponse.json({ error: vendeursRes.error.message }, { status: 500 });
  }

  const vendeurCountBySupplier = new Map<string, number>();
  for (const row of vendeursRes.data ?? []) {
    const sid = String((row as { supplier_id: string }).supplier_id);
    vendeurCountBySupplier.set(sid, (vendeurCountBySupplier.get(sid) ?? 0) + 1);
  }

  const suppliers = (suppliersRes.data ?? []).map((s) => {
    const id = String((s as { id: string }).id);
    const code = (s as { code?: string | null }).code ?? null;
    const vendeurCount = vendeurCountBySupplier.get(id) ?? 0;
    return {
      ...s,
      usesDeliveryDate: supplierUsesDeliveryDate(code, vendeurCount),
    };
  });

  return NextResponse.json({ suppliers });
}
