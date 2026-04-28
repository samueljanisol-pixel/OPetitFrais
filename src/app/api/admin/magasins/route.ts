import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function GET() {
  const gate = await requireApiPermission("admin.magasins");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: magasins, error } = await service
    .from("magasins")
    .select("id, code, nom, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (magasins ?? []).map((m) => m.id);
  let caissesByMag: Record<string, unknown[]> = {};
  if (ids.length) {
    const { data: caisses, error: ce } = await service
      .from("caisses")
      .select("id, magasin_id, code, nom, sort_order, created_at, updated_at")
      .in("magasin_id", ids)
      .order("sort_order", { ascending: true })
      .order("nom", { ascending: true });
    if (ce) {
      return NextResponse.json({ error: ce.message }, { status: 500 });
    }
    caissesByMag = {};
    for (const c of caisses ?? []) {
      const mid = c.magasin_id as string;
      if (!caissesByMag[mid]) caissesByMag[mid] = [];
      caissesByMag[mid].push(c);
    }
  }

  const rows = (magasins ?? []).map((m) => ({
    ...m,
    caisses: caissesByMag[m.id] ?? [],
  }));

  return NextResponse.json({ magasins: rows });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("admin.magasins");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { code?: string; nom?: string; sort_order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  const nom = (body.nom ?? "").trim();
  if (!code || !nom) {
    return NextResponse.json({ error: "Code et nom requis" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const sort_order = typeof body.sort_order === "number" && Number.isFinite(body.sort_order) ? body.sort_order : 0;

  const { data: row, error } = await service
    .from("magasins")
    .insert({ code, nom, sort_order })
    .select("id, code, nom, sort_order, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ magasin: { ...row, caisses: [] } });
}
