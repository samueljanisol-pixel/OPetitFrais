import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { parsePeriodicite } from "@/lib/ca/magasinCharges";

export type MagasinChargeApiRow = {
  id: string;
  magasin_id: string | null;
  label: string;
  quantite: number;
  prix: number;
  periodicite: "jour" | "mois";
  sort_order: number;
};

export type MagasinLite = {
  id: string;
  code: string;
  nom: string;
  sort_order: number;
};

export async function GET() {
  const gate = await requireAnyApiPermission([
    "parametres.read",
    "parametres.write",
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

  const [chargesRes, magasinsRes] = await Promise.all([
    service
      .from("magasin_charge")
      .select("id, magasin_id, label, quantite, prix, periodicite, sort_order")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    service
      .from("magasins")
      .select("id, code, nom, sort_order")
      .order("sort_order", { ascending: true })
      .order("nom", { ascending: true }),
  ]);

  if (chargesRes.error) {
    return NextResponse.json({ error: chargesRes.error.message }, { status: 500 });
  }
  if (magasinsRes.error) {
    return NextResponse.json({ error: magasinsRes.error.message }, { status: 500 });
  }

  const charges: MagasinChargeApiRow[] = [];
  for (const r of chargesRes.data ?? []) {
    const periodicite = parsePeriodicite(r.periodicite);
    if (!periodicite) continue;
    const quantite = typeof r.quantite === "number" ? r.quantite : Number(r.quantite);
    const prix = typeof r.prix === "number" ? r.prix : Number(r.prix);
    if (!Number.isFinite(quantite) || !Number.isFinite(prix)) continue;
    charges.push({
      id: r.id as string,
      magasin_id: (r.magasin_id as string | null) ?? null,
      label: r.label as string,
      quantite,
      prix,
      periodicite,
      sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    });
  }

  return NextResponse.json({
    charges,
    magasins: (magasinsRes.data ?? []) as MagasinLite[],
  });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("parametres.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: {
    magasin_id?: string | null;
    label?: string;
    quantite?: number | string;
    prix?: number | string;
    periodicite?: string;
    sort_order?: number | string;
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

  const periodicite = parsePeriodicite(body.periodicite);
  if (!periodicite) {
    return NextResponse.json({ error: "Périodicité invalide (jour ou mois)" }, { status: 400 });
  }

  const quantite = typeof body.quantite === "number" ? body.quantite : Number(String(body.quantite ?? "").replace(",", "."));
  const prix = typeof body.prix === "number" ? body.prix : Number(String(body.prix ?? "").replace(",", "."));
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide (> 0)" }, { status: 400 });
  }
  if (!Number.isFinite(prix) || prix < 0) {
    return NextResponse.json({ error: "Prix invalide (≥ 0)" }, { status: 400 });
  }

  const magasinRaw = body.magasin_id;
  const magasin_id =
    magasinRaw === null || magasinRaw === undefined || String(magasinRaw).trim() === ""
      ? null
      : String(magasinRaw).trim();

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

  if (magasin_id) {
    const { data: mag, error: me } = await service.from("magasins").select("id").eq("id", magasin_id).maybeSingle();
    if (me) return NextResponse.json({ error: me.message }, { status: 500 });
    if (!mag) return NextResponse.json({ error: "Magasin introuvable" }, { status: 400 });
  }

  const { data, error } = await service
    .from("magasin_charge")
    .insert({
      magasin_id,
      label,
      quantite,
      prix,
      periodicite,
      sort_order,
    })
    .select("id, magasin_id, label, quantite, prix, periodicite, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ charge: data });
}
