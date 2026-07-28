import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";

function isYm(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw);
}

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

  const { data: feuilles, error } = await service
    .from("magasin_charge_feuille")
    .select("id, ym, created_at, updated_at")
    .order("ym", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (feuilles ?? []).map((f) => f.id as string);
  const totalsByFeuille: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: lignes, error: le } = await service
      .from("magasin_charge_feuille_ligne")
      .select("feuille_id, quantite, prix")
      .in("feuille_id", ids);
    if (le) {
      return NextResponse.json({ error: le.message }, { status: 500 });
    }
    for (const row of lignes ?? []) {
      const fid = row.feuille_id as string;
      const q = typeof row.quantite === "number" ? row.quantite : Number(row.quantite);
      const p = typeof row.prix === "number" ? row.prix : Number(row.prix);
      if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
      totalsByFeuille[fid] = (totalsByFeuille[fid] ?? 0) + q * p;
    }
  }

  return NextResponse.json({
    feuilles: (feuilles ?? []).map((f) => ({
      id: f.id as string,
      ym: f.ym as string,
      created_at: f.created_at as string,
      updated_at: f.updated_at as string,
      total: totalsByFeuille[f.id as string] ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("charges.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { ym?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const ym = typeof body.ym === "string" ? body.ym.trim() : "";
  if (!isYm(ym)) {
    return NextResponse.json({ error: "Mois invalide (YYYY-MM)" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: existing } = await service
    .from("magasin_charge_feuille")
    .select("id, ym")
    .eq("ym", ym)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Une feuille existe déjà pour ce mois", feuille: existing }, { status: 409 });
  }

  const { data, error } = await service
    .from("magasin_charge_feuille")
    .insert({ ym })
    .select("id, ym, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feuille: { ...data, total: 0 } });
}
