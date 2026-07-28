import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import {
  FICHE_SELECT,
  LIGNE_SELECT,
  parseFicheRow,
  parseLigneRow,
  sumLignesMontant,
} from "@/lib/emballages/achat-api";
import { achatsMutationsDisabledResponse } from "@/lib/emballages/achats-disabled";

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

export async function PATCH() {
  return achatsMutationsDisabledResponse();
}

export async function POST() {
  return achatsMutationsDisabledResponse();
}

export async function DELETE() {
  return achatsMutationsDisabledResponse();
}
