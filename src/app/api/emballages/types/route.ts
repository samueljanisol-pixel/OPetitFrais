import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import type { EmballageTypeRow } from "@/lib/emballages/types";

const TYPE_SELECT = "id, label, sort_order, active, created_at, updated_at";

export async function GET() {
  const gate = await requireAnyApiPermission([
    "emballages.read",
    "emballages.write",
    "produits.read",
    "produits.write",
  ]);
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
    .from("ref_emballage_type")
    .select(TYPE_SELECT)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ types: (data ?? []) as EmballageTypeRow[] });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { label?: string; sort_order?: number | string; active?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
  }

  const sort_order =
    typeof body.sort_order === "number"
      ? body.sort_order
      : Number.parseInt(String(body.sort_order ?? "0"), 10) || 0;

  const active = typeof body.active === "boolean" ? body.active : true;

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data, error } = await service
    .from("ref_emballage_type")
    .insert({ label, sort_order, active })
    .select(TYPE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ type: data as EmballageTypeRow });
}
