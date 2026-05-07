import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  categoryDisplayLabel,
  compareByCategoryThenProductName,
  parseCategoryFromRef,
} from "@/lib/commandes-fournisseur/ligne-category-order";
import {
  montantLigneFromPu,
  qtyBaseFromLotLine,
} from "@/lib/commandes-fournisseur/achat-pricing";
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";
import { buildLotProductDisplayInfo } from "@/lib/commandes-fournisseur/product-display";

type Ctx = { params: Promise<{ id: string }> };

type LignePatch = {
  lotLigneId: string;
  vendeur_id?: string | null;
  marque_achete?: boolean;
  qte_achat?: number;
  prix_achat_unitaire?: number | null;
  montant_ligne_achat?: number | null;
  product_packaging_id?: string | null;
};

type PatchBody = {
  ligneUpdates?: LignePatch[];
  status?: "terminee";
  confirmZeroQtyLines?: boolean;
  /** Frais lot : lignes générales (vendeur_id null dans la table). **/
  fraisDeleteIds?: string[];
  fraisUpserts?: Array<{
    id?: string;
    label: string;
    montant: number;
  }>;
};

type LotLigneProd = {
  ref_category?: unknown;
  name?: string;
};

function oneNestedProduct(p: LotLigneProd | LotLigneProd[] | null | undefined): LotLigneProd | null {
  if (p == null) return null;
  return (Array.isArray(p) ? p[0] : p) as LotLigneProd;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: lot, error } = await supabase
    .from("commande_fournisseur_lot")
    .select(
      "id, supplier_id, status, commentaire, created_at, marque_prete_at, marque_terminee_at, ref_supplier(id, code, label)",
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

  const [lotLigs, fraisRes, vendeursRes] = await Promise.all([
    supabase
      .from("commande_fournisseur_lot_ligne")
      .select(
        "id, product_id, product_packaging_id, qte_achat, qte_besoin_fige, vendeur_id, marque_achete, prix_achat_unitaire, montant_ligne_achat, product(id, name, code, ref_sales_unit(label), ref_category(label, sort_order), product_packaging(id, quantity, ref_conditionnement(label), ref_sales_unit(label))), commande_fournisseur_lot_ligne_magasin(magasin_id, qte, magasins(id, code, nom))",
      )
      .eq("lot_id", id),
    supabase
      .from("commande_fournisseur_lot_frais")
      .select("id, lot_id, type_code, label, montant, vendeur_id, created_at")
      .eq("lot_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("ref_supplier_vendeur")
      .select("id, supplier_id, label, sort_order, created_at")
      .eq("supplier_id", supplierId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  if (lotLigs.error) {
    return NextResponse.json({ error: lotLigs.error.message }, { status: 500 });
  }
  if (fraisRes.error) {
    return NextResponse.json({ error: fraisRes.error.message }, { status: 500 });
  }
  if (vendeursRes.error) {
    return NextResponse.json({ error: vendeursRes.error.message }, { status: 500 });
  }

  type LotRow = {
    id: string;
    product_id: string;
    product?: LotLigneProd | LotLigneProd[] | null;
  };

  const rows = [...(lotLigs.data ?? [])] as LotRow[];
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

  const lignesWithCategory = rows.map((row) => {
    const pa = oneNestedProduct(row.product);
    const cat = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
    const categoryLabel = categoryDisplayLabel(cat);
    return { ...row, categoryLabel };
  });

  return NextResponse.json({
    lot,
    lignes: lignesWithCategory,
    frais: fraisRes.data ?? [],
    vendeurs: vendeursRes.data ?? [],
  });
}

async function vendorBelongsSupplier(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  vendeurId: string,
  supplierId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ref_supplier_vendeur")
    .select("id")
    .eq("id", vendeurId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (error || !data) {
    return false;
  }
  return true;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: lotCur, error: leLot } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, supplier_id, status")
    .eq("id", id)
    .maybeSingle();

  if (leLot || !lotCur) {
    return NextResponse.json({ error: leLot?.message ?? "Introuvable" }, { status: leLot ? 500 : 404 });
  }

  const lotStatus = (lotCur as { status: string }).status;
  const supplierId = (lotCur as { supplier_id: string }).supplier_id;

  if (lotStatus === "terminee") {
    if (body.ligneUpdates && body.ligneUpdates.length > 0) {
      return NextResponse.json({ error: "Lot terminé : modification des lignes impossible" }, { status: 403 });
    }
    if (
      (body.fraisDeleteIds && body.fraisDeleteIds.length > 0) ||
      (body.fraisUpserts && body.fraisUpserts.length > 0)
    ) {
      return NextResponse.json({ error: "Lot terminé : modification des frais impossible" }, { status: 403 });
    }
  }

  const hasFraisDeletes = Boolean(body.fraisDeleteIds && body.fraisDeleteIds.length > 0);
  const hasFraisUpserts = Boolean(body.fraisUpserts && body.fraisUpserts.length > 0);

  if (lotStatus !== "prete") {
    if (body.status === "terminee") {
      return NextResponse.json({ error: "Seul un lot « prêt » peut être clôturé" }, { status: 409 });
    }
    if (body.ligneUpdates && body.ligneUpdates.length > 0) {
      return NextResponse.json({ error: "Modifications impossibles pour ce statut" }, { status: 409 });
    }
    if (
      hasFraisDeletes ||
      hasFraisUpserts
    ) {
      return NextResponse.json({ error: "Modifications des frais impossibles pour ce statut" }, { status: 409 });
    }
    return NextResponse.json({ error: "Aucune action applicable" }, { status: 400 });
  }

  const hasClose = body.status === "terminee";
  const hasLines = Boolean(body.ligneUpdates && body.ligneUpdates.length > 0);
  const hasFrais = hasFraisDeletes || hasFraisUpserts;

  if (!hasClose && !hasLines && !hasFrais) {
    return NextResponse.json({ error: "Corps de requête vide" }, { status: 400 });
  }

  if (hasLines) {
    const { error: lumpErr } = await applyLineUpdates(supabase, id, supplierId, body.ligneUpdates!);
    if (lumpErr) {
      return lumpErr.response;
    }
  }

  let fraisApresPatch:
    | Array<{
        id: string;
        type_code: string;
        label: string | null;
        montant: number | string | null;
        vendeur_id: string | null;
      }>
    | undefined;

  if (hasFrais) {
    const frac = await applyFraisUpserts(supabase, id, body.fraisDeleteIds, body.fraisUpserts);
    if (frac.error) return frac.error;
    fraisApresPatch = frac.frais;
  }

  if (hasClose) {
    const out = await cloturerLotAchat({
      supabase,
      lotId: id,
      supplierId,
      confirmZeroQtyLines: Boolean(body.confirmZeroQtyLines),
    });
    if ("error" in out) {
      if (out.needConfirmLines) {
        return NextResponse.json(
          {
            error: out.error,
            code: "NEED_CONFIRM_ZERO_QTY",
            lignesSansQteAchats: out.needConfirmLines,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: out.error }, { status: out.status ?? 400 });
    }
    return NextResponse.json({
      ok: true,
      cloturee: true,
      ...(fraisApresPatch ? { frais: fraisApresPatch } : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    ...(fraisApresPatch ? { frais: fraisApresPatch } : {}),
  });
}

type FraisGlobauxApiRow = {
  id: string;
  type_code: string;
  label: string | null;
  montant: number | string | null;
  vendeur_id: string | null;
};

async function fetchFraisGlobauxPourLot(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lotId: string,
): Promise<{ error: NextResponse | null; frais?: FraisGlobauxApiRow[] }> {
  const { data, error } = await supabase
    .from("commande_fournisseur_lot_frais")
    .select("id, type_code, label, montant, vendeur_id")
    .eq("lot_id", lotId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  const fraisGlobaux = (data ?? []).filter(
    (r): r is FraisGlobauxApiRow => r.vendeur_id == null,
  );
  return { error: null, frais: fraisGlobaux };
}

async function applyFraisUpserts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lotId: string,
  fraisDeleteIds: PatchBody["fraisDeleteIds"],
  fraisUpserts: PatchBody["fraisUpserts"],
): Promise<{ error: NextResponse | null; frais?: FraisGlobauxApiRow[] }> {
  if (fraisDeleteIds && fraisDeleteIds.length > 0) {
    for (const fid of fraisDeleteIds) {
      if (typeof fid !== "string" || fid.trim().length === 0) {
        return {
          error: NextResponse.json({ error: "Identifiant de frais à supprimer invalide" }, { status: 400 }),
        };
      }
      const { error } = await supabase
        .from("commande_fournisseur_lot_frais")
        .delete()
        .eq("id", fid)
        .eq("lot_id", lotId);
      if (error) {
        return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
      }
    }
  }

  if (!fraisUpserts || fraisUpserts.length === 0) {
    return fetchFraisGlobauxPourLot(supabase, lotId);
  }

  for (const u of fraisUpserts) {
    const labelRaw = typeof u.label === "string" ? u.label.trim() : "";
    if (!labelRaw) {
      return { error: NextResponse.json({ error: "Libellé frais requis" }, { status: 400 }) };
    }

    const mRaw = typeof u.montant === "number" ? u.montant : Number(u.montant);
    if (!Number.isFinite(mRaw) || mRaw < 0) {
      return { error: NextResponse.json({ error: "Montant frais invalide" }, { status: 400 }) };
    }
    const montant = Math.round(mRaw * 100) / 100;

    if (u.id !== undefined && u.id !== null && String(u.id).length > 0) {
      const fid = String(u.id);
      const { error } = await supabase
        .from("commande_fournisseur_lot_frais")
        .update({ label: labelRaw, montant })
        .eq("id", fid)
        .eq("lot_id", lotId);

      if (error) {
        return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
      }
    } else {
      const { error } = await supabase.from("commande_fournisseur_lot_frais").insert({
        lot_id: lotId,
        type_code: "autre",
        label: labelRaw,
        montant,
        vendeur_id: null,
      });
      if (error) {
        return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
      }
    }
  }

  return fetchFraisGlobauxPourLot(supabase, lotId);
}

async function applyLineUpdates(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lotId: string,
  supplierId: string,
  updates: LignePatch[],
): Promise<{ error: null } | { error: { response: NextResponse } }> {
  for (const u of updates) {
    if (typeof u.lotLigneId !== "string") {
      return { error: { response: NextResponse.json({ error: "lotLigneId invalide" }, { status: 400 }) } };
    }

    const { data: ligne, error: le } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .select(
        "id, lot_id, product_id, product_packaging_id, qte_achat, vendeur_id, marque_achete, prix_achat_unitaire, montant_ligne_achat, product(id, name, ref_sales_unit(label), product_packaging(id, quantity, ref_conditionnement(label), ref_sales_unit(label)))",
      )
      .eq("id", u.lotLigneId)
      .maybeSingle();

    if (le || !ligne) {
      return {
        error: { response: NextResponse.json({ error: le?.message ?? "Ligne introuvable" }, { status: le ? 500 : 404 }) },
      };
    }

    const rowLotId = (ligne as { lot_id: string }).lot_id;
    if (rowLotId !== lotId) {
      return { error: { response: NextResponse.json({ error: "Ligne hors lot" }, { status: 400 }) } };
    }

    let vendeurId: string | null | undefined =
      u.vendeur_id !== undefined ? u.vendeur_id : undefined;
    if (vendeurId !== undefined && vendeurId !== null && vendeurId.length > 0) {
      const ok = await vendorBelongsSupplier(supabase, vendeurId, supplierId);
      if (!ok) {
        return { error: { response: NextResponse.json({ error: "Vendeur invalide pour ce fournisseur" }, { status: 400 }) } };
      }
    }

    const patchMarque = u.marque_achete;
    const ligneVendeur = (ligne as { vendeur_id?: string | null }).vendeur_id;
    const nextVendeur = u.vendeur_id !== undefined ? u.vendeur_id : ligneVendeur;

    if (patchMarque === true && (nextVendeur == null || String(nextVendeur).length === 0)) {
      return {
        error: {
          response: NextResponse.json(
            { error: "marque_achete requiert un vendeur sur la ligne" },
            { status: 400 },
          ),
        },
      };
    }

    const mergedPackagingId =
      u.product_packaging_id !== undefined
        ? u.product_packaging_id
        : ((ligne as { product_packaging_id?: string | null }).product_packaging_id ?? null);

    let qteAchat =
      u.qte_achat !== undefined
        ? clampQtyToApiRange(u.qte_achat)
        : Number((ligne as { qte_achat?: number }).qte_achat) || 0;

    const puInput = u.prix_achat_unitaire !== undefined ? u.prix_achat_unitaire : ((ligne as { prix_achat_unitaire?: number | null }).prix_achat_unitaire ?? null);

    let pu: number | null =
      puInput === undefined
        ? ((ligne as { prix_achat_unitaire?: number | null }).prix_achat_unitaire ?? null)
        : puInput;

    if (typeof pu === "number" && !Number.isFinite(pu)) {
      pu = null;
    }
    if (pu !== null && pu < 0) {
      pu = null;
    }

    const rawProd = (ligne as { product?: unknown }).product;
    const productForDisplay =
      rawProd == null || rawProd === undefined
        ? null
        : Array.isArray(rawProd)
          ? rawProd[0]
          : rawProd;
    const display = buildLotProductDisplayInfo(
      productForDisplay as Parameters<typeof buildLotProductDisplayInfo>[0],
      mergedPackagingId,
    );
    let qtyBase = qtyBaseFromLotLine(Number.isFinite(qteAchat) ? qteAchat : 0, display);

    if (u.montant_ligne_achat !== undefined && u.prix_achat_unitaire === undefined) {
      const m = u.montant_ligne_achat;
      if (m != null && Number.isFinite(m) && qtyBase > 0) {
        const derived = Math.round((Number(m) / qtyBase) * 10000) / 10000;
        pu = derived >= 0 ? derived : null;
      }
    }

    let montant = montantLigneFromPu(pu, qtyBase);
    if (pu === 0) {
      montant = 0;
    }

    const rowUpdate: Record<string, unknown> = {};
    if (u.vendeur_id !== undefined) rowUpdate.vendeur_id = u.vendeur_id;
    if (u.marque_achete !== undefined) rowUpdate.marque_achete = u.marque_achete;
    if (u.qte_achat !== undefined) rowUpdate.qte_achat = qteAchat;
    if (u.product_packaging_id !== undefined) rowUpdate.product_packaging_id = u.product_packaging_id;

    const qtyOrPriceTouched =
      u.qte_achat !== undefined ||
      u.prix_achat_unitaire !== undefined ||
      u.montant_ligne_achat !== undefined ||
      u.product_packaging_id !== undefined;

    if (qtyOrPriceTouched) {
      rowUpdate.prix_achat_unitaire = pu;
      rowUpdate.montant_ligne_achat = montant;
    }

    if (Object.keys(rowUpdate).length === 0) {
      continue;
    }

    const { error: ue } = await supabase
      .from("commande_fournisseur_lot_ligne")
      .update(rowUpdate)
      .eq("id", u.lotLigneId);
    if (ue) {
      return { error: { response: NextResponse.json({ error: ue.message }, { status: 500 }) } };
    }
  }

  return { error: null };
}

async function cloturerLotAchat(opts: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  lotId: string;
  supplierId: string;
  confirmZeroQtyLines: boolean;
}): Promise<
  | { ok: true }
  | {
      error: string;
      status?: number;
      needConfirmLines?: Array<{ lotLigneId: string; productName: string | null }>;
    }
> {
  const { supabase, lotId, confirmZeroQtyLines } = opts;

  const { data: lignes, error } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select(
      "id, product_id, qte_achat, prix_achat_unitaire, montant_ligne_achat, vendeur_id, marque_achete, product(name)",
    )
    .eq("lot_id", lotId);

  if (error || !lignes) {
    return { error: error?.message ?? "Lignes introuvables", status: 500 };
  }

  const listeSansVendeur: string[] = [];
  const listePuVide: Array<{ lotLigneId: string; productName: string | null }> = [];
  const listeQteZero: Array<{ lotLigneId: string; productName: string | null }> = [];

  for (const L of lignes) {
    const lid = String((L as { id: string }).id);
    const vendeur = (L as { vendeur_id?: string | null }).vendeur_id;
    if (vendeur == null || String(vendeur).length === 0) {
      listeSansVendeur.push(lid);
    }
    const pu = (L as { prix_achat_unitaire?: number | null }).prix_achat_unitaire;
    if (pu === null || pu === undefined || Number.isNaN(Number(pu))) {
      listePuVide.push({
        lotLigneId: lid,
        productName: extractNestedProductName(L),
      });
    }
    const qaa = Number((L as { qte_achat?: number | null }).qte_achat) || 0;
    if (qaa === 0) {
      listeQteZero.push({
        lotLigneId: lid,
        productName: extractNestedProductName(L),
      });
    }
  }

  if (listeSansVendeur.length > 0) {
    return { error: "Chaque ligne doit avoir un vendeur avant clôture", status: 400 };
  }

  if (listeQteZero.length > 0 && !confirmZeroQtyLines) {
    return {
      error: "Certaines lignes ont une quantité achat à 0 : confirmation requise",
      status: 409,
      needConfirmLines: listeQteZero,
    };
  }

  if (listePuVide.length > 0) {
    return { error: "Prix unitaire manquant sur une ou plusieurs lignes", status: 400 };
  }

  for (const L of lignes) {
    const pu = Number((L as { prix_achat_unitaire: number }).prix_achat_unitaire);
    const pid = String((L as { product_id: string }).product_id);
    if (pu > 0) {
      const { error: pe } = await supabase.from("product").update({ cost_purchase: pu }).eq("id", pid);
      if (pe) {
        return { error: pe.message, status: 500 };
      }
    }
  }

  const { error: ue } = await supabase
    .from("commande_fournisseur_lot")
    .update({
      status: "terminee",
      marque_terminee_at: new Date().toISOString(),
    })
    .eq("id", lotId)
    .eq("status", "prete");

  if (ue) {
    return { error: ue.message, status: 500 };
  }

  return { ok: true };
}

function extractNestedProductName(raw: Record<string, unknown>): string | null {
  const p = raw["product"] as { name?: string } | { name?: string }[] | null | undefined;
  if (!p) return null;
  const one = Array.isArray(p) ? p[0] : p;
  return typeof one?.name === "string" ? one.name : null;
}
