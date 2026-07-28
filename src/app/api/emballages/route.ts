import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { EMBALLAGE_SELECT, parseEmballageRow } from "@/lib/emballages/emballage-api";

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
    .from("ref_emballage")
    .select(EMBALLAGE_SELECT)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    emballages: (data ?? []).map((r) => parseEmballageRow(r as Record<string, unknown>)),
  });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: {
    label?: string;
    type_id?: string;
    sort_order?: number | string;
    active?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
  }

  const type_id = typeof body.type_id === "string" ? body.type_id.trim() : "";
  if (!type_id) {
    return NextResponse.json({ error: "Type requis" }, { status: 400 });
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
    .from("ref_emballage")
    .insert({ label, type_id, sort_order, active })
    .select(EMBALLAGE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ emballage: parseEmballageRow(data as Record<string, unknown>) });
}
