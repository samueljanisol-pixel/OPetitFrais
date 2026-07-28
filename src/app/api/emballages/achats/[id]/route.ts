import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  FICHE_SELECT,
  isIsoDate,
  LIGNE_SELECT,
  parseFicheRow,
  parseLigneRow,
  sumLignesMontant,
} from "@/lib/emballages/achat-api";
import { parseEmballageNumeric } from "@/lib/emballages/types";
import { validateEmballagesVendeurId } from "@/lib/emballages/supplier-api";

type Ctx = { params: Promise<{ id: string }> };

async function loadFiche(service: ReturnType<typeof createSupabaseServiceRoleClient>, id: string) {
  const { data, error } = await service
    .from("emballage_achat_fiche")
    .select(FICHE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message, fiche: null };
  if (!data) return { error: "Achat introuvable", fiche: null };
  return { error: null, fiche: parseFicheRow(data as Record<string, unknown>) };
}

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireAnyApiPermission(["emballages.read", "emballages.write"]);
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

  const loaded = await loadFiche(service, id);
  if (!loaded.fiche) {
    return NextResponse.json({ error: loaded.error ?? "Achat introuvable" }, { status: 404 });
  }

  const { data: lignesRaw, error: le } = await service
    .from("emballage_achat_ligne")
    .select(LIGNE_SELECT)
    .eq("fiche_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (le) {
    return NextResponse.json({ error: le.message }, { status: 500 });
  }

  const lignes = (lignesRaw ?? []).map((r) => parseLigneRow(r as Record<string, unknown>));

  return NextResponse.json({
    achat: {
      ...loaded.fiche,
      total: sumLignesMontant(lignes),
      ligne_count: lignes.length,
    },
    lignes,
  });
}

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

  let body: { date_achat?: string; note?: string | null; vendeur_id?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const loaded = await loadFiche(service, id);
  if (!loaded.fiche) {
    return NextResponse.json({ error: loaded.error ?? "Achat introuvable" }, { status: 404 });
  }
  if (loaded.fiche.statut !== "ouvert") {
    return NextResponse.json({ error: "Achat clôturé — modification impossible" }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if ("date_achat" in body) {
    const date_achat = typeof body.date_achat === "string" ? body.date_achat.trim() : "";
    if (!isIsoDate(date_achat)) {
      return NextResponse.json({ error: "Date invalide (YYYY-MM-DD)" }, { status: 400 });
    }
    patch.date_achat = date_achat;
  }
  if ("note" in body) {
    patch.note =
      body.note == null || body.note === ""
        ? null
        : typeof body.note === "string"
          ? body.note.trim() || null
          : null;
  }
  if ("vendeur_id" in body) {
    if (body.vendeur_id == null || body.vendeur_id === "") {
      patch.vendeur_id = null;
    } else if (typeof body.vendeur_id === "string" && body.vendeur_id.trim()) {
      const check = await validateEmballagesVendeurId(service, body.vendeur_id.trim());
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      patch.vendeur_id = body.vendeur_id.trim();
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const { data, error } = await service
    .from("emballage_achat_fiche")
    .update(patch)
    .eq("id", id)
    .select(FICHE_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Achat introuvable" }, { status: 404 });
  }

  return NextResponse.json({ achat: parseFicheRow(data as Record<string, unknown>) });
}

export async function POST(req: Request, ctx: Ctx) {
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
    emballage_id?: string;
    quantite?: number | string;
    prix_unitaire?: number | string;
    note?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const emballage_id = typeof body.emballage_id === "string" ? body.emballage_id.trim() : "";
  if (!emballage_id) {
    return NextResponse.json({ error: "Emballage requis" }, { status: 400 });
  }

  const quantite = parseEmballageNumeric(body.quantite);
  if (quantite == null || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide" }, { status: 400 });
  }

  const prix_unitaire = parseEmballageNumeric(body.prix_unitaire);
  if (prix_unitaire == null || prix_unitaire < 0) {
    return NextResponse.json({ error: "Prix unitaire invalide" }, { status: 400 });
  }

  const note =
    body.note == null || body.note === ""
      ? null
      : typeof body.note === "string"
        ? body.note.trim() || null
        : null;

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const loaded = await loadFiche(service, id);
  if (!loaded.fiche) {
    return NextResponse.json({ error: loaded.error ?? "Achat introuvable" }, { status: 404 });
  }
  if (loaded.fiche.statut !== "ouvert") {
    return NextResponse.json({ error: "Achat clôturé — ajout de ligne impossible" }, { status: 409 });
  }

  const { count, error: ce } = await service
    .from("emballage_achat_ligne")
    .select("id", { count: "exact", head: true })
    .eq("fiche_id", id);
  if (ce) {
    return NextResponse.json({ error: ce.message }, { status: 500 });
  }

  const { data, error } = await service
    .from("emballage_achat_ligne")
    .insert({
      fiche_id: id,
      emballage_id,
      quantite,
      prix_unitaire,
      note,
      sort_order: (count ?? 0) + 1,
    })
    .select(LIGNE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ligne: parseLigneRow(data as Record<string, unknown>) });
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

  const loaded = await loadFiche(service, id);
  if (!loaded.fiche) {
    return NextResponse.json({ error: loaded.error ?? "Achat introuvable" }, { status: 404 });
  }
  if (loaded.fiche.statut !== "ouvert") {
    return NextResponse.json({ error: "Achat clôturé — suppression impossible" }, { status: 409 });
  }

  const { error } = await service.from("emballage_achat_fiche").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
