import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { cancelDraftLot } from "@/lib/commandes-fournisseur/cancel-draft-lot";

type Ctx = { params: Promise<{ id: string }> };

/** Annule un lot « brouillon » : les commandes redeviennent « Validée » hors lot. */
export async function POST(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id: lotId } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const res = await cancelDraftLot(supabase, lotId);
  if ("error" in res) {
    const status = res.error.includes("introuvable") ? 404 : 409;
    return NextResponse.json({ error: res.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
