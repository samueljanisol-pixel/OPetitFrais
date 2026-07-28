import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parsePeriodicite } from "@/lib/ca/magasinCharges";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("charges.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawId } = await ctx.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
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

  const patch: Record<string, unknown> = {};

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
    }
    patch.label = label;
  }

  if ("periodicite" in body) {
    const periodicite = parsePeriodicite(body.periodicite);
    if (!periodicite) {
      return NextResponse.json({ error: "Périodicité invalide (jour ou mois)" }, { status: 400 });
    }
    patch.periodicite = periodicite;
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

  if (typeof patch.magasin_id === "string") {
    const { data: mag, error: me } = await service
      .from("magasins")
      .select("id")
      .eq("id", patch.magasin_id)
      .maybeSingle();
    if (me) return NextResponse.json({ error: me.message }, { status: 500 });
    if (!mag) return NextResponse.json({ error: "Magasin introuvable" }, { status: 400 });
  }

  const { data, error } = await service
    .from("magasin_charge")
    .update(patch)
    .eq("id", id)
    .select("id, magasin_id, label, quantite, prix, periodicite, sort_order")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Charge introuvable" }, { status: 404 });
  }

  return NextResponse.json({ charge: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("charges.write");
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

  const { error } = await service.from("magasin_charge").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
