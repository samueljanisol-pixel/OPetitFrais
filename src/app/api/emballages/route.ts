import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { isEmballageCategorieCode } from "@/lib/emballages/constants";
import { EMBALLAGE_SELECT, parseEmballageRow } from "@/lib/emballages/emballage-api";
import { loadEmballageCategorieIdByCode } from "@/lib/emballages/supplier-api";

export async function GET(req: Request) {
  const gate = await requireAnyApiPermission(["emballages.read", "emballages.write"]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const categorieCode = url.searchParams.get("categorie")?.trim() ?? "";

  if (categorieCode && !isEmballageCategorieCode(categorieCode)) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  let query = service
    .from("ref_emballage")
    .select(EMBALLAGE_SELECT)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (categorieCode) {
    const categorieId = await loadEmballageCategorieIdByCode(service, categorieCode);
    if (!categorieId) {
      return NextResponse.json({ error: "Catégorie introuvable" }, { status: 500 });
    }
    query = query.eq("categorie_id", categorieId);
  }

  const { data, error } = await query;

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
    categorie_id?: string;
    reference?: string | null;
    type_id?: string | null;
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

  const categorie_id = typeof body.categorie_id === "string" ? body.categorie_id.trim() : "";
  if (!categorie_id) {
    return NextResponse.json({ error: "Catégorie requise" }, { status: 400 });
  }

  const type_id =
    typeof body.type_id === "string" && body.type_id.trim() ? body.type_id.trim() : null;

  const reference =
    body.reference == null || body.reference === ""
      ? null
      : typeof body.reference === "string"
        ? body.reference.trim() || null
        : null;

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
    .insert({ label, categorie_id, reference, type_id, sort_order, active })
    .select(EMBALLAGE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ emballage: parseEmballageRow(data as Record<string, unknown>) });
}
