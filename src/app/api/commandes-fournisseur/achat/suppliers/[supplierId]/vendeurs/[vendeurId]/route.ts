import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

type Ctx = { params: Promise<{ supplierId: string; vendeurId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { supplierId, vendeurId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.vendeurs_renommer");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const label =
    typeof body === "object" && body !== null && typeof (body as { label?: unknown }).label === "string"
      ? (body as { label: string }).label.trim()
      : "";

  if (label.length === 0) {
    return NextResponse.json({ error: "label requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: updated, error } = await supabase
    .from("ref_supplier_vendeur")
    .update({ label })
    .eq("id", vendeurId)
    .eq("supplier_id", supplierId)
    .select("id, supplier_id, label, sort_order, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Vendeur introuvable ou autre fournisseur" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
