import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { normalizeProductPackagingId } from "@/lib/commandes-fournisseur/commande-ligne-key";

type Ctx = { params: Promise<{ id: string }> };

type PatchBody = {
  ligneId?: string;
  commandeId?: string;
  productId?: string;
  productPackagingId?: string | null;
  lineComment?: string | null;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: lotId } = await ctx.params;
  const gate = await requireAnyApiPermission([
    "commandes_fournisseur.achat",
    "commandes_fournisseur.consolidation",
  ]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  let ligneId = body.ligneId?.trim() ?? "";
  const commandeId = body.commandeId?.trim() ?? "";
  const productId = body.productId?.trim() ?? "";

  const supabase = await createSupabaseServerClient();

  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) {
    return NextResponse.json({ error: lotErr.message }, { status: 500 });
  }
  if (!lot) {
    return NextResponse.json({ error: "Lot introuvable" }, { status: 404 });
  }

  const lotStatus = (lot as { status: string }).status;
  const { data: keysRaw } = await supabase.rpc("get_my_permission_keys");
  const keys = new Set((keysRaw as string[]) ?? []);
  const canAchat = keys.has("commandes_fournisseur.achat");
  const canConsolid = keys.has("commandes_fournisseur.consolidation");

  if (canConsolid && lotStatus === "brouillon") {
    // ok
  } else if (canAchat && lotStatus === "prete") {
    // ok
  } else {
    return NextResponse.json(
      { error: "Modification du commentaire impossible pour ce statut de lot" },
      { status: 409 },
    );
  }

  if (!ligneId) {
    if (!commandeId || !productId) {
      return NextResponse.json(
        { error: "ligneId ou (commandeId + productId) requis" },
        { status: 400 },
      );
    }
    if (lotStatus !== "brouillon" || !canConsolid) {
      return NextResponse.json(
        { error: "Création de ligne commentaire réservée à la consolidation (lot brouillon)" },
        { status: 409 },
      );
    }
    const packagingId = normalizeProductPackagingId(body.productPackagingId);
    let exQuery = supabase
      .from("commande_fournisseur_ligne")
      .select("id")
      .eq("commande_id", commandeId)
      .eq("product_id", productId);
    if (packagingId) {
      exQuery = exQuery.eq("product_packaging_id", packagingId);
    } else {
      exQuery = exQuery.is("product_packaging_id", null);
    }
    const { data: existing, error: exErr } = await exQuery.maybeSingle();
    if (exErr) {
      return NextResponse.json({ error: exErr.message }, { status: 500 });
    }
    if (existing) {
      ligneId = (existing as { id: string }).id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("commande_fournisseur_ligne")
        .insert({
          commande_id: commandeId,
          product_id: productId,
          product_packaging_id: packagingId,
          qte: 0,
          line_comment: null,
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      if (!inserted) {
        return NextResponse.json(
          {
            error:
              "Création de ligne refusée (droits ou statut). Vérifiez la migration RLS insert commentaire lot.",
          },
          { status: 403 },
        );
      }
      ligneId = (inserted as { id: string }).id;
    }
  }

  const { data: ligne, error: ligneErr } = await supabase
    .from("commande_fournisseur_ligne")
    .select("id, commande_id")
    .eq("id", ligneId)
    .maybeSingle();
  if (ligneErr) {
    return NextResponse.json({ error: ligneErr.message }, { status: 500 });
  }
  if (!ligne) {
    return NextResponse.json({ error: "Ligne commande introuvable" }, { status: 404 });
  }

  const commandeIdResolved = (ligne as { commande_id: string }).commande_id;
  const { data: inc, error: incErr } = await supabase
    .from("commande_fournisseur_lot_inclusion")
    .select("lot_id")
    .eq("lot_id", lotId)
    .eq("commande_id", commandeIdResolved)
    .maybeSingle();
  if (incErr) {
    return NextResponse.json({ error: incErr.message }, { status: 500 });
  }
  if (!inc) {
    return NextResponse.json({ error: "Ligne hors lot" }, { status: 400 });
  }

  let lineComment: string | null = null;
  if (body.lineComment !== undefined && body.lineComment !== null) {
    const trimmed = String(body.lineComment).trim();
    lineComment = trimmed.length > 0 ? trimmed : null;
  }

  const { data: updated, error: ue } = await supabase
    .from("commande_fournisseur_ligne")
    .update({ line_comment: lineComment })
    .eq("id", ligneId)
    .select("id, line_comment")
    .maybeSingle();
  if (ue) {
    return NextResponse.json({ error: ue.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Mise à jour refusée (droits ou statut de la commande). Vérifiez que la migration RLS commentaire lot est appliquée.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    ligneId,
    lineComment: (updated as { line_comment: string | null }).line_comment,
  });
}
