import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { FICHE_SELECT, LIGNE_SELECT, parseFicheRow, parseLigneRow } from "@/lib/emballages/achat-api";
import { parseEmballageNumeric } from "@/lib/emballages/types";

type Ctx = { params: Promise<{ id: string; ligneId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawFicheId, ligneId: rawLigneId } = await ctx.params;
  const ficheId = typeof rawFicheId === "string" ? rawFicheId.trim() : "";
  const ligneId = typeof rawLigneId === "string" ? rawLigneId.trim() : "";
  if (!ficheId || !ligneId) {
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

  const patch: Record<string, unknown> = {};
  if ("emballage_id" in body) {
    const emballage_id = typeof body.emballage_id === "string" ? body.emballage_id.trim() : "";
    if (!emballage_id) {
      return NextResponse.json({ error: "Emballage requis" }, { status: 400 });
    }
    patch.emballage_id = emballage_id;
  }
  if ("quantite" in body) {
    const quantite = parseEmballageNumeric(body.quantite);
    if (quantite == null || quantite <= 0) {
      return NextResponse.json({ error: "Quantité invalide" }, { status: 400 });
    }
    patch.quantite = quantite;
  }
  if ("prix_unitaire" in body) {
    const prix_unitaire = parseEmballageNumeric(body.prix_unitaire);
    if (prix_unitaire == null || prix_unitaire < 0) {
      return NextResponse.json({ error: "Prix unitaire invalide" }, { status: 400 });
    }
    patch.prix_unitaire = prix_unitaire;
  }
  if ("note" in body) {
    patch.note =
      body.note == null || body.note === ""
        ? null
        : typeof body.note === "string"
          ? body.note.trim() || null
          : null;
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

  const { data: ficheRaw, error: fe } = await service
    .from("emballage_achat_fiche")
    .select(FICHE_SELECT)
    .eq("id", ficheId)
    .maybeSingle();
  if (fe) {
    return NextResponse.json({ error: fe.message }, { status: 500 });
  }
  if (!ficheRaw) {
    return NextResponse.json({ error: "Achat introuvable" }, { status: 404 });
  }
  const fiche = parseFicheRow(ficheRaw as Record<string, unknown>);
  if (fiche.statut !== "ouvert") {
    return NextResponse.json({ error: "Achat clôturé — modification impossible" }, { status: 409 });
  }

  const { data, error } = await service
    .from("emballage_achat_ligne")
    .update(patch)
    .eq("id", ligneId)
    .eq("fiche_id", ficheId)
    .select(LIGNE_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ligne: parseLigneRow(data as Record<string, unknown>) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: rawFicheId, ligneId: rawLigneId } = await ctx.params;
  const ficheId = typeof rawFicheId === "string" ? rawFicheId.trim() : "";
  const ligneId = typeof rawLigneId === "string" ? rawLigneId.trim() : "";
  if (!ficheId || !ligneId) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: ficheRaw, error: fe } = await service
    .from("emballage_achat_fiche")
    .select(FICHE_SELECT)
    .eq("id", ficheId)
    .maybeSingle();
  if (fe) {
    return NextResponse.json({ error: fe.message }, { status: 500 });
  }
  if (!ficheRaw) {
    return NextResponse.json({ error: "Achat introuvable" }, { status: 404 });
  }
  const fiche = parseFicheRow(ficheRaw as Record<string, unknown>);
  if (fiche.statut !== "ouvert") {
    return NextResponse.json({ error: "Achat clôturé — suppression impossible" }, { status: 409 });
  }

  const { error } = await service
    .from("emballage_achat_ligne")
    .delete()
    .eq("id", ligneId)
    .eq("fiche_id", ficheId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
