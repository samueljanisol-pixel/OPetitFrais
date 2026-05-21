import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  categoryDisplayLabel,
  compareByCategoryThenProductName,
  parseCategoryFromRef,
} from "@/lib/commandes-fournisseur/ligne-category-order";
import { assignProductVendeursToLotLines } from "@/lib/commandes-fournisseur/product-vendeur";
import {
  commentairesMagasinFromTargets,
  enrichSaisieTargetsForMagasins,
  magasinCommentSlotsForLot,
  saisieLigneTargetsByProductForLot,
} from "@/lib/commandes-fournisseur/ligne-saisie-comments";
import { packagingIdByProductFromCommandeLignes } from "@/lib/commandes-fournisseur/packaging-from-saisie";
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";
import { syncCommandeLignesFromLotMagasinQty } from "@/lib/commandes-fournisseur/sync-lot-magasin-lignes";

type Ctx = { params: Promise<{ id: string }> };

type LotPatchBody = {
  /** Vers prêt depuis brouillon, ou retour en brouillon depuis prêt (pour rééditer consolidation). */
  status?: "prete" | "brouillon";
  setMagasinQte?: { lotLigneId: string; magasinId: string; qte: number };
  removeLotLigneId?: string;
  /** Commentaire général du lot (brouillon uniquement). */
  lotCommentaire?: string | null;
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

/** Au passage brouillon → prêt : fige Σ magasin dans qte_besoin_fige et remet quantité achete à 0. */
async function freezeBesoinEtResetQteAchat(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lotId: string,
): Promise<string | null> {
  const { data: lignes, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id")
    .eq("lot_id", lotId);
  if (le) {
    return le.message;
  }
  for (const ligne of lignes ?? []) {
    const lotLigneId = (ligne as { id: string }).id;
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
      .update({
        qte_besoin_fige: total,
        qte_achat: 0,
      })
      .eq("id", lotLigneId);
    if (ue) {
      return ue.message;
    }
  }
  return null;
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
      "id, supplier_id, status, commentaire, created_at, marque_prete_at, ref_supplier(id, code, label), commande_fournisseur_lot_inclusion(commande_fournisseur(id, magasin_id, status, commentaire, created_at, validated_at, magasins(id, code, nom), ref_supplier(label)))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!lot) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const supplierId = (lot as { supplier_id: string }).supplier_id;

  const [lotLignesRes, vendeursRes] = await Promise.all([
    supabase
      .from("commande_fournisseur_lot_ligne")
      .select(
        "id, product_id, product_packaging_id, qte_achat, qte_besoin_fige, vendeur_id, marque_achete, prix_achat_unitaire, montant_ligne_achat, product(id, name, name_ar, code, ref_sales_unit(label), ref_category(label, sort_order), product_packaging(id, quantity, nom, ref_conditionnement(label), ref_sales_unit(label))), commande_fournisseur_lot_ligne_magasin(magasin_id, qte, magasins(id, code, nom))",
      )
      .eq("lot_id", id),
    supabase
      .from("ref_supplier_vendeur")
      .select("id, label")
      .eq("supplier_id", supplierId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  const { data: lotLignes, error: lErr } = lotLignesRes;
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }
  if (vendeursRes.error) {
    return NextResponse.json({ error: vendeursRes.error.message }, { status: 500 });
  }

  type LotLigneProd = {
    ref_category?: unknown;
    name?: string;
  };

  function oneNestedProduct(p: LotLigneProd | LotLigneProd[] | null | undefined): LotLigneProd | null {
    if (p == null) return null;
    return (Array.isArray(p) ? p[0] : p) as LotLigneProd;
  }

  type LotRow = {
    id: string;
    product_id: string;
    product?: LotLigneProd | LotLigneProd[] | null;
  };

  const rows = [...(lotLignes ?? [])] as LotRow[];
  rows.sort((a, b) => {
    const pa = oneNestedProduct(a.product);
    const pb = oneNestedProduct(b.product);
    const ca = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
    const cb = pb ? parseCategoryFromRef(pb.ref_category) : { label: "", sort_order: null };
    return compareByCategoryThenProductName(
      ca,
      cb,
      pa?.name ?? "",
      pb?.name ?? "",
      String(a.id),
      String(b.id),
    );
  });

  const lotStatus = (lot as { status: string }).status;
  await syncCommandeLignesFromLotMagasinQty(supabase, id, lotStatus);

  const targetsByProduct = await saisieLigneTargetsByProductForLot(supabase, id);
  const magasinSlots = await magasinCommentSlotsForLot(supabase, id);

  const commandeIds = [
    ...new Set(
      (
        (lot as { commande_fournisseur_lot_inclusion?: unknown[] }).commande_fournisseur_lot_inclusion ??
        []
      ).flatMap((inc) => {
        const cf = (inc as { commande_fournisseur?: { id?: string } | { id?: string }[] })
          .commande_fournisseur;
        const oneCf = Array.isArray(cf) ? cf[0] : cf;
        const cid = oneCf?.id;
        return typeof cid === "string" && cid.length > 0 ? [cid] : [];
      }),
    ),
  ];
  const productIdsForPack = rows.map((r) => (r as { product_id: string }).product_id);
  const saisiePackagingByProduct = await packagingIdByProductFromCommandeLignes(
    supabase,
    commandeIds,
    productIdsForPack,
  );

  const lignesWithCategory = rows.map((row) => {
    const pa = oneNestedProduct(row.product);
    const cat = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
    const categoryLabel = categoryDisplayLabel(cat);
    const pid = (row as { product_id: string }).product_id;
    const rawTargets = targetsByProduct.get(pid) ?? [];
    const saisieLigneTargets = enrichSaisieTargetsForMagasins(rawTargets, magasinSlots);
    const commentairesMagasin = commentairesMagasinFromTargets(rawTargets);
    const storedPackId = (row as { product_packaging_id?: string | null }).product_packaging_id ?? null;
    const product_packaging_id =
      storedPackId ?? saisiePackagingByProduct.get(pid) ?? null;
    return {
      ...row,
      product_packaging_id,
      categoryLabel,
      commentairesMagasin,
      saisieLigneTargets,
    };
  });

  const vendeurs = (vendeursRes.data ?? []).map((v) => {
    const row = v as { id: string; label: string };
    return { id: row.id, label: row.label };
  });

  return NextResponse.json({ lot, lignes: lignesWithCategory, vendeurs });
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

  const nKeys = [
    body.status !== undefined,
    body.setMagasinQte !== undefined,
    body.removeLotLigneId != null,
    body.lotCommentaire !== undefined,
  ].filter(Boolean).length;
  if (nKeys !== 1) {
    return NextResponse.json(
      {
        error:
          "Un seul de : status (prete ou brouillon), setMagasinQte, removeLotLigneId, lotCommentaire",
      },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (body.lotCommentaire !== undefined) {
    if (body.lotCommentaire !== null && typeof body.lotCommentaire !== "string") {
      return NextResponse.json({ error: "lotCommentaire invalide" }, { status: 400 });
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
    const stored =
      body.lotCommentaire === null
        ? null
        : typeof body.lotCommentaire === "string"
          ? body.lotCommentaire.trim() === ""
            ? null
            : body.lotCommentaire.trim()
          : null;
    const { error: ue } = await supabase
      .from("commande_fournisseur_lot")
      .update({ commentaire: stored })
      .eq("id", id);
    if (ue) {
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

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
    const qte = clampQtyToApiRange(rawQte);

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

    if (qte > 0) {
      await syncCommandeLignesFromLotMagasinQty(supabase, id, "brouillon");
    }

    const errRe = await recomputeQteAchat(supabase, lotLigneId);
    if (errRe) {
      return NextResponse.json({ error: errRe }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.status !== undefined) {
    const { data: cur, error: re } = await supabase
      .from("commande_fournisseur_lot")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (re || !cur) {
      return NextResponse.json({ error: re?.message ?? "Introuvable" }, { status: re ? 500 : 404 });
    }
    const st = (cur as { status: string }).status;

    if (body.status === "prete") {
      if (st !== "brouillon") {
        return NextResponse.json({ error: "Seul un lot brouillon peut être marqué prêt" }, { status: 409 });
      }

      const { data: lotRow, error: lotRowErr } = await supabase
        .from("commande_fournisseur_lot")
        .select("supplier_id")
        .eq("id", id)
        .maybeSingle();
      if (lotRowErr || !lotRow) {
        return NextResponse.json(
          { error: lotRowErr?.message ?? "Lot introuvable" },
          { status: lotRowErr ? 500 : 404 },
        );
      }
      const supplierId = (lotRow as { supplier_id: string }).supplier_id;

      const { error: ue } = await supabase
        .from("commande_fournisseur_lot")
        .update({ status: "prete", marque_prete_at: new Date().toISOString() })
        .eq("id", id);
      if (ue) {
        return NextResponse.json({ error: ue.message }, { status: 500 });
      }

      const errFreeze = await freezeBesoinEtResetQteAchat(supabase, id);
      if (errFreeze) {
        return NextResponse.json({ error: errFreeze }, { status: 500 });
      }

      const errVendeur = await assignProductVendeursToLotLines(supabase, id, supplierId);
      if (errVendeur) {
        return NextResponse.json({ error: errVendeur }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (body.status === "brouillon") {
      if (st !== "prete") {
        return NextResponse.json(
          { error: "Seul un lot « prêt pour l’achat » peut revenir en saisie" },
          { status: 409 },
        );
      }

      const { error: ue } = await supabase
        .from("commande_fournisseur_lot")
        .update({ status: "brouillon", marque_prete_at: null })
        .eq("id", id);
      if (ue) {
        return NextResponse.json({ error: ue.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Valeur de status non reconnue" }, { status: 400 });
  }

  return NextResponse.json({ error: "Requête non reconnue" }, { status: 400 });
}
