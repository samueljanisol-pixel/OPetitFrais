import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { EMBALLAGE_SELECT, parseEmballageRow } from "@/lib/emballages/emballage-api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawId } = await ctx.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
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

  const patch: Record<string, unknown> = {};
  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
    }
    patch.label = label;
  }
  if ("type_id" in body) {
    const type_id = typeof body.type_id === "string" ? body.type_id.trim() : "";
    if (!type_id) {
      return NextResponse.json({ error: "Type requis" }, { status: 400 });
    }
    patch.type_id = type_id;
  }
  if ("sort_order" in body) {
    patch.sort_order =
      typeof body.sort_order === "number"
        ? body.sort_order
        : Number.parseInt(String(body.sort_order ?? "0"), 10) || 0;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Champ active invalide" }, { status: 400 });
    }
    patch.active = body.active;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data, error } = await service
    .from("ref_emballage")
    .update(patch)
    .eq("id", id)
    .select(EMBALLAGE_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Emballage introuvable" }, { status: 404 });
  }

  return NextResponse.json({ emballage: parseEmballageRow(data as Record<string, unknown>) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawId } = await ctx.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { count, error: ce } = await service
    .from("emballage_achat_ligne")
    .select("id", { count: "exact", head: true })
    .eq("emballage_id", id);
  if (ce) {
    return NextResponse.json({ error: ce.message }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Emballage utilisé sur des achats — suppression impossible" },
      { status: 409 },
    );
  }

  const { error } = await service.from("ref_emballage").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
