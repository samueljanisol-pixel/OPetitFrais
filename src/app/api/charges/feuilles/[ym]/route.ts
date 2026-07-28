import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";

type Ctx = { params: Promise<{ ym: string }> };

function isYm(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw);
}

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireAnyApiPermission([
    "charges.read",
    "charges.write",
    "ventes.read",
  ]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { ym: rawYm } = await ctx.params;
  const ym = typeof rawYm === "string" ? decodeURIComponent(rawYm).trim() : "";
  if (!isYm(ym)) {
    return NextResponse.json({ error: "Mois invalide (YYYY-MM)" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: feuille, error: fe } = await service
    .from("magasin_charge_feuille")
    .select("id, ym, created_at, updated_at")
    .eq("ym", ym)
    .maybeSingle();

  if (fe) {
    return NextResponse.json({ error: fe.message }, { status: 500 });
  }
  if (!feuille) {
    return NextResponse.json({ error: "Feuille introuvable" }, { status: 404 });
  }

  const [lignesRes, catsRes, magsRes] = await Promise.all([
    service
      .from("magasin_charge_feuille_ligne")
      .select("id, feuille_id, categorie_id, magasin_id, label, quantite, prix, sort_order")
      .eq("feuille_id", feuille.id)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    service
      .from("ref_charge_categorie")
      .select("id, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    service
      .from("magasins")
      .select("id, code, nom, sort_order")
      .order("sort_order", { ascending: true })
      .order("nom", { ascending: true }),
  ]);

  if (lignesRes.error) {
    return NextResponse.json({ error: lignesRes.error.message }, { status: 500 });
  }
  if (catsRes.error) {
    return NextResponse.json({ error: catsRes.error.message }, { status: 500 });
  }
  if (magsRes.error) {
    return NextResponse.json({ error: magsRes.error.message }, { status: 500 });
  }

  const lignes = (lignesRes.data ?? []).map((r) => {
    const quantite = typeof r.quantite === "number" ? r.quantite : Number(r.quantite);
    const prix = typeof r.prix === "number" ? r.prix : Number(r.prix);
    return {
      id: r.id as string,
      feuille_id: r.feuille_id as string,
      categorie_id: r.categorie_id as string,
      magasin_id: (r.magasin_id as string | null) ?? null,
      label: r.label as string,
      quantite: Number.isFinite(quantite) ? quantite : 0,
      prix: Number.isFinite(prix) ? prix : 0,
      sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    };
  });

  return NextResponse.json({
    feuille,
    lignes,
    categories: catsRes.data ?? [],
    magasins: magsRes.data ?? [],
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("charges.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { ym: rawYm } = await ctx.params;
  const ym = typeof rawYm === "string" ? decodeURIComponent(rawYm).trim() : "";
  if (!isYm(ym)) {
    return NextResponse.json({ error: "Mois invalide (YYYY-MM)" }, { status: 400 });
  }

  let body: {
    categorie_id?: string;
    magasin_id?: string | null;
    label?: string;
    quantite?: number | string;
    prix?: number | string;
    sort_order?: number | string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const categorie_id = typeof body.categorie_id === "string" ? body.categorie_id.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!categorie_id) {
    return NextResponse.json({ error: "Catégorie requise" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
  }

  const quantite =
    typeof body.quantite === "number" ? body.quantite : Number(String(body.quantite ?? "").replace(",", "."));
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

  const { data: feuille, error: fe } = await service
    .from("magasin_charge_feuille")
    .select("id")
    .eq("ym", ym)
    .maybeSingle();
  if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
  if (!feuille) return NextResponse.json({ error: "Feuille introuvable" }, { status: 404 });

  const { data: cat } = await service.from("ref_charge_categorie").select("id").eq("id", categorie_id).maybeSingle();
  if (!cat) return NextResponse.json({ error: "Catégorie introuvable" }, { status: 400 });

  if (magasin_id) {
    const { data: mag } = await service.from("magasins").select("id").eq("id", magasin_id).maybeSingle();
    if (!mag) return NextResponse.json({ error: "Magasin introuvable" }, { status: 400 });
  }

  const { data, error } = await service
    .from("magasin_charge_feuille_ligne")
    .insert({
      feuille_id: feuille.id,
      categorie_id,
      magasin_id,
      label,
      quantite,
      prix,
      sort_order,
    })
    .select("id, feuille_id, categorie_id, magasin_id, label, quantite, prix, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ligne: data });
}
