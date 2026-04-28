import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiPermission("admin.magasins");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: magasinId } = await ctx.params;

  let body: { nom?: string; code?: string | null; sort_order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const nom = (body.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }

  const code =
    body.code === null || body.code === undefined || body.code === ""
      ? null
      : String(body.code).trim() || null;

  const sort_order =
    typeof body.sort_order === "number" && Number.isFinite(body.sort_order) ? body.sort_order : 0;

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: row, error } = await service
    .from("caisses")
    .insert({ magasin_id: magasinId, nom, code, sort_order })
    .select("id, magasin_id, code, nom, sort_order, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ caisse: row });
}
