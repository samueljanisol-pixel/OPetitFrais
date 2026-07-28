import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { FICHE_SELECT, parseFicheRow } from "@/lib/emballages/achat-api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
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

  const { data: ficheRaw, error: fe } = await service
    .from("emballage_achat_fiche")
    .select(FICHE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (fe) {
    return NextResponse.json({ error: fe.message }, { status: 500 });
  }
  if (!ficheRaw) {
    return NextResponse.json({ error: "Achat introuvable" }, { status: 404 });
  }

  const fiche = parseFicheRow(ficheRaw as Record<string, unknown>);
  if (fiche.statut !== "ouvert") {
    return NextResponse.json({ error: "Achat déjà clôturé" }, { status: 409 });
  }

  const { count, error: ce } = await service
    .from("emballage_achat_ligne")
    .select("id", { count: "exact", head: true })
    .eq("fiche_id", id);
  if (ce) {
    return NextResponse.json({ error: ce.message }, { status: 500 });
  }
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: "Ajoutez au moins une ligne avant de clôturer" }, { status: 400 });
  }

  const cloture_at = new Date().toISOString();
  const { data, error } = await service
    .from("emballage_achat_fiche")
    .update({ statut: "cloture", cloture_at })
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
