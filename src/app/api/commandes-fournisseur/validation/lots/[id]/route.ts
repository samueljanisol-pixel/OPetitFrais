import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

type Ctx = { params: Promise<{ id: string }> };

type LotPatchBody = {
  status?: "prete";
  setMagasinQte?: { lotLigneId: string; magasinId: string; qte: number };
  removeLotLigneId?: string;
};

async function recomputeQteAchat(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lotLigneId: string,
): Promise<string | null> {
  const { data: rows, error: se } = await supabase
    .from("commande_fournisseur_lot_ligne_magasin")
    .select("qte")
    .eq("lot_ligne_id", lotLigneId);
  if (se) {
    return se.message;
  }
  const total = (rows ?? []).reduce((s, r) => s + (Number((r as { qte: number }).qte) || 0), 0);
  const { error: ue } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .update({ qte_achat: total })
    .eq("id", lotLigneId);
  return ue ? ue.message : null;
}

async function magasinAutorisePourLot(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lotId: string,
  magasinId: string,
): Promise<boolean> {
  const { data: incs, error } = await supabase
    .from("commande_fournisseur_lot_inclusion")
    .select("commande_fournisseur(magasin_id)")
    .eq("lot_id", lotId);
  if (error || !incs) {
    return false;
  }
  for (const row of incs) {
    const cf = (row as { commande_fournisseur?: { magasin_id: string } | { magasin_id: string }[] | null })
      .commande_fournisseur;
    const c = Array.isArray(cf) ? cf[0] : cf;
    if (c?.magasin_id === magasinId) {
      return true;
    }
  }
  return false;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: lot, error } = await supabase
    .from("commande_fournisseur_lot")
    .select(
      "id, supplier_id, status, commentaire, created_at, marque_prete_at, ref_supplier(id, code, label), commande_fournisseur_lot_inclusion(commande_fournisseur(id, magasin_id, status, magasins(id, code, nom), ref_supplier(label)))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!lot) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const { data: lotLignes, error: lErr } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select(
      "id, product_id, qte_achat, product(id, name, code, ref_sales_unit(label), product_packaging(id, quantity, ref_conditionnement(label), ref_sales_unit(label))), commande_fournisseur_lot_ligne_magasin(magasin_id, qte, magasins(id, code, nom))",
    )
    .eq("lot_id", id);

  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  return NextResponse.json({ lot, lignes: lotLignes ?? [] });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: LotPatchBody;
  try {
    body = (await req.json()) as LotPatchBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const nKeys = [body.status !== undefined, body.setMagasinQte !== undefined, body.removeLotLigneId != null].filter(
    Boolean,
  ).length;
  if (nKeys !== 1) {
    return NextResponse.json(
      { error: "Un seul de : status, setMagasinQte, removeLotLigneId" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (body.removeLotLigneId != null) {
    const lotLigneId = body.removeLotLigneId;
    const { data: lotRow, error: le1 } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .select("id, lot_id")
      .eq("id", lotLigneId)
      .maybeSingle();
    if (le1) {
      return NextResponse.json({ error: le1.message }, { status: 500 });
    }
    if (!lotRow || (lotRow as { lot_id: string }).lot_id !== id) {
      return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });
    }
    const { data: lotCur, error: re2 } = await supabase
      .from("commande_fournisseur_lot")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (re2 || !lotCur) {
      return NextResponse.json({ error: re2?.message ?? "Introuvable" }, { status: re2 ? 500 : 404 });
    }
    if ((lotCur as { status: string }).status !== "brouillon") {
      return NextResponse.json({ error: "Modification impossible : lot non brouillon" }, { status: 409 });
    }
    const { error: de } = await supabase.from("commande_fournisseur_lot_ligne").delete().eq("id", lotLigneId);
    if (de) {
      return NextResponse.json({ error: de.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.setMagasinQte) {
    const { lotLigneId, magasinId, qte: rawQte } = body.setMagasinQte;
    if (typeof lotLigneId !== "string" || typeof magasinId !== "string" || typeof rawQte !== "number") {
      return NextResponse.json({ error: "setMagasinQte invalide" }, { status: 400 });
    }
    const qte = Math.max(0, Math.min(1_000_000_000, Math.floor(rawQte)));

    const { data: lotRow, error: le1 } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .select("id, lot_id")
      .eq("id", lotLigneId)
      .maybeSingle();
    if (le1) {
      return NextResponse.json({ error: le1.message }, { status: 500 });
    }
    if (!lotRow || (lotRow as { lot_id: string }).lot_id !== id) {
      return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });
    }
    const { data: lotCur, error: re2 } = await supabase
      .from("commande_fournisseur_lot")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (re2 || !lotCur) {
      return NextResponse.json({ error: re2?.message ?? "Introuvable" }, { status: re2 ? 500 : 404 });
    }
    if ((lotCur as { status: string }).status !== "brouillon") {
      return NextResponse.json({ error: "Modification impossible : lot non brouillon" }, { status: 409 });
    }
    const magOk = await magasinAutorisePourLot(supabase, id, magasinId);
    if (!magOk) {
      return NextResponse.json({ error: "Magasin non concerné par ce lot" }, { status: 403 });
    }

    if (qte === 0) {
      const { error: d0 } = await supabase
        .from("commande_fournisseur_lot_ligne_magasin")
        .delete()
        .eq("lot_ligne_id", lotLigneId)
        .eq("magasin_id", magasinId);
      if (d0) {
        return NextResponse.json({ error: d0.message }, { status: 500 });
      }
    } else {
      const { data: ex, error: exE } = await supabase
        .from("commande_fournisseur_lot_ligne_magasin")
        .select("lot_ligne_id")
        .eq("lot_ligne_id", lotLigneId)
        .eq("magasin_id", magasinId)
        .maybeSingle();
      if (exE) {
        return NextResponse.json({ error: exE.message }, { status: 500 });
      }
      if (ex) {
        const { error: up } = await supabase
          .from("commande_fournisseur_lot_ligne_magasin")
          .update({ qte })
          .eq("lot_ligne_id", lotLigneId)
          .eq("magasin_id", magasinId);
        if (up) {
          return NextResponse.json({ error: up.message }, { status: 500 });
        }
      } else {
        const { error: ins } = await supabase
          .from("commande_fournisseur_lot_ligne_magasin")
          .insert({ lot_ligne_id: lotLigneId, magasin_id: magasinId, qte });
        if (ins) {
          return NextResponse.json({ error: ins.message }, { status: 500 });
        }
      }
    }

    const errRe = await recomputeQteAchat(supabase, lotLigneId);
    if (errRe) {
      return NextResponse.json({ error: errRe }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.status === "prete") {
    const { data: cur, error: re } = await supabase
      .from("commande_fournisseur_lot")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (re || !cur) {
      return NextResponse.json({ error: re?.message ?? "Introuvable" }, { status: re ? 500 : 404 });
    }
    const st = (cur as { status: string }).status;
    if (st !== "brouillon") {
      return NextResponse.json({ error: "Seul un lot brouillon peut être marqué prêt" }, { status: 409 });
    }

    const { error: ue } = await supabase
      .from("commande_fournisseur_lot")
      .update({ status: "prete", marque_prete_at: new Date().toISOString() })
      .eq("id", id);
    if (ue) {
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Requête non reconnue" }, { status: 400 });
}
