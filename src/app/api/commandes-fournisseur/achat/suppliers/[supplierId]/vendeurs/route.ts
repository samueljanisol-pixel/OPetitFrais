import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

type Ctx = { params: Promise<{ supplierId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { supplierId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("ref_supplier_vendeur")
    .select("id, supplier_id, label, sort_order, created_at")
    .eq("supplier_id", supplierId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vendeurs: rows ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { supplierId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
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
  const { data: inserted, error } = await supabase
    .from("ref_supplier_vendeur")
    .insert({ supplier_id: supplierId, label })
    .select("id, supplier_id, label, sort_order, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted ?? { error: "Création refusée" }, { status: inserted ? 201 : 400 });
}
