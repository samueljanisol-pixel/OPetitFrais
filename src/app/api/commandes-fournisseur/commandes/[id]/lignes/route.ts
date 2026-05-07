import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { userHasMagasin } from "@/lib/commandes-fournisseur/api-helpers";
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";
import { fallbackStatusLabel } from "@/lib/statusLabels/defaults";

type LigneIn = {
  productId: string;
  productPackagingId: string | null;
  qte: number;
  lineComment?: string | null;
  horsFournisseur?: boolean;
};

type Ctx = { params: Promise<{ id: string }> };

/** Remplacement atomique des lignes (brouillon uniquement). */
export async function PUT(req: Request, ctx: Ctx) {
  const { id: commandeId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { lignes?: LigneIn[] };
  try {
    body = (await req.json()) as { lignes?: LigneIn[] };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const lignes = body.lignes ?? [];
  if (!Array.isArray(lignes)) {
    return NextResponse.json({ error: "lignes doit être un tableau" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: re } = await supabase
    .from("commande_fournisseur")
    .select("id, magasin_id, status, supplier_id")
    .eq("id", commandeId)
    .maybeSingle();

  if (re || !current) {
    return NextResponse.json({ error: re?.message ?? "Introuvable" }, { status: re ? 500 : 404 });
  }

  if (current.status !== "en_saisie") {
    return NextResponse.json(
      {
        error: `Modification réservée au statut « ${fallbackStatusLabel("commande_fournisseur", "en_saisie")} »`,
      },
      { status: 409 },
    );
  }

  const okM = await userHasMagasin(supabase, gate.userId, current.magasin_id as string);
  if (!okM) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  for (const l of lignes) {
    if (!l.productId || typeof l.qte !== "number" || !Number.isFinite(l.qte) || l.qte < 0) {
      return NextResponse.json(
        { error: "Chaque ligne: productId et qte (nombre fini ≥ 0)" },
        { status: 400 },
      );
    }
  }

  const { error: delErr } = await supabase
    .from("commande_fournisseur_ligne")
    .delete()
    .eq("commande_id", commandeId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const toInsert = lignes
    .filter((l) => l.qte > 0)
    .map((l) => ({
      commande_id: commandeId,
      product_id: l.productId,
      product_packaging_id: l.productPackagingId,
      qte: clampQtyToApiRange(l.qte),
      line_comment: l.lineComment ?? null,
      hors_fournisseur: Boolean(l.horsFournisseur),
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const { error: insErr } = await supabase.from("commande_fournisseur_ligne").insert(toInsert);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: toInsert.length });
}
