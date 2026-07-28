import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";

export type ChargeCategorieRow = {
  id: string;
  label: string;
  sort_order: number;
};

export async function GET() {
  const gate = await requireAnyApiPermission([
    "charges.read",
    "charges.write",
    "ventes.read",
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
    .from("ref_charge_categorie")
    .select("id, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: (data ?? []) as ChargeCategorieRow[] });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("charges.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { label?: string; sort_order?: number | string };
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

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data, error } = await service
    .from("ref_charge_categorie")
    .insert({ label, sort_order })
    .select("id, label, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data as ChargeCategorieRow });
}
