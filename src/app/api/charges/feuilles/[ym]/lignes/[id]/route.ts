import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

type Ctx = { params: Promise<{ ym: string; id: string }> };

function isYm(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("charges.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { ym: rawYm, id: rawId } = await ctx.params;
  const ym = typeof rawYm === "string" ? decodeURIComponent(rawYm).trim() : "";
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!isYm(ym) || !id) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
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

  const patch: Record<string, unknown> = {};
  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
    patch.label = label;
  }
  if ("categorie_id" in body) {
    const categorie_id = typeof body.categorie_id === "string" ? body.categorie_id.trim() : "";
    if (!categorie_id) return NextResponse.json({ error: "Catégorie requise" }, { status: 400 });
    patch.categorie_id = categorie_id;
  }
  if ("quantite" in body) {
    const quantite =
      typeof body.quantite === "number" ? body.quantite : Number(String(body.quantite ?? "").replace(",", "."));
    if (!Number.isFinite(quantite) || quantite <= 0) {
      return NextResponse.json({ error: "Quantité invalide (> 0)" }, { status: 400 });
    }
    patch.quantite = quantite;
  }
  if ("prix" in body) {
    const prix = typeof body.prix === "number" ? body.prix : Number(String(body.prix ?? "").replace(",", "."));
    if (!Number.isFinite(prix) || prix < 0) {
      return NextResponse.json({ error: "Prix invalide (≥ 0)" }, { status: 400 });
    }
    patch.prix = prix;
  }
  if ("sort_order" in body) {
    patch.sort_order =
      typeof body.sort_order === "number"
        ? body.sort_order
        : Number.parseInt(String(body.sort_order ?? "0"), 10) || 0;
  }
  if ("magasin_id" in body) {
    const magasinRaw = body.magasin_id;
    patch.magasin_id =
      magasinRaw === null || magasinRaw === undefined || String(magasinRaw).trim() === ""
        ? null
        : String(magasinRaw).trim();
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

  const { data: feuille } = await service.from("magasin_charge_feuille").select("id").eq("ym", ym).maybeSingle();
  if (!feuille) {
    return NextResponse.json({ error: "Feuille introuvable" }, { status: 404 });
  }

  if (typeof patch.categorie_id === "string") {
    const { data: cat } = await service
      .from("ref_charge_categorie")
      .select("id")
      .eq("id", patch.categorie_id)
      .maybeSingle();
    if (!cat) return NextResponse.json({ error: "Catégorie introuvable" }, { status: 400 });
  }
  if (typeof patch.magasin_id === "string") {
    const { data: mag } = await service.from("magasins").select("id").eq("id", patch.magasin_id).maybeSingle();
    if (!mag) return NextResponse.json({ error: "Magasin introuvable" }, { status: 400 });
  }

  const { data, error } = await service
    .from("magasin_charge_feuille_ligne")
    .update(patch)
    .eq("id", id)
    .eq("feuille_id", feuille.id)
    .select("id, feuille_id, categorie_id, magasin_id, label, quantite, prix, sort_order")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ligne: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("charges.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { ym: rawYm, id: rawId } = await ctx.params;
  const ym = typeof rawYm === "string" ? decodeURIComponent(rawYm).trim() : "";
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!isYm(ym) || !id) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: feuille } = await service.from("magasin_charge_feuille").select("id").eq("ym", ym).maybeSingle();
  if (!feuille) {
    return NextResponse.json({ error: "Feuille introuvable" }, { status: 404 });
  }

  const { error } = await service
    .from("magasin_charge_feuille_ligne")
    .delete()
    .eq("id", id)
    .eq("feuille_id", feuille.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
