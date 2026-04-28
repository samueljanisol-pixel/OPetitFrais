import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { userHasMagasin } from "@/lib/commandes-fournisseur/api-helpers";

type Ctx = { params: Promise<{ id: string }> };

/** Annule une commande (statut « annulee »). Réservé à la saisie, magasin, si en_saisie ou validee et hors lot. */
export async function POST(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: cmd, error: re } = await supabase
    .from("commande_fournisseur")
    .select("id, magasin_id, status, lot_id")
    .eq("id", id)
    .maybeSingle();

  if (re || !cmd) {
    return NextResponse.json({ error: re?.message ?? "Introuvable" }, { status: re ? 500 : 404 });
  }

  const okM = await userHasMagasin(supabase, gate.userId, cmd.magasin_id as string);
  if (!okM) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const st = cmd.status as string;
  if (st !== "en_saisie" && st !== "validee") {
    return NextResponse.json(
      { error: "Annulation réservée aux commandes en saisie ou validées" },
      { status: 409 },
    );
  }
  if (cmd.lot_id) {
    return NextResponse.json(
      { error: "Impossible d’annuler une commande déjà rattachée à un lot" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { error: up } = await supabase
    .from("commande_fournisseur")
    .update({
      status: "annulee",
      cancelled_at: now,
      cancelled_by: gate.userId,
    })
    .eq("id", id);

  if (up) {
    return NextResponse.json({ error: up.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
