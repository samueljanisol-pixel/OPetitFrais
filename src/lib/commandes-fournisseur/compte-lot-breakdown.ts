import type { SupabaseClient } from "@supabase/supabase-js";
import { montantLigneFromPu, qtyBaseFromLotLine } from "@/lib/commandes-fournisseur/achat-pricing";
import { buildLotProductDisplayInfo } from "@/lib/commandes-fournisseur/product-display";

export type CompteAchatKind = "station" | "vendeur";

export type CompteAchatBreakdownItem = {
  kind: CompteAchatKind;
  vendeur_id: string | null;
  montant_total: number;
};

export type CompteAchatLineDetail = {
  product_id: string;
  product_name: string;
  qte_achat: number;
  prix_unitaire: number | null;
  uda_label: string | null;
  montant: number;
};

export type CompteAchatBreakdownResult = {
  items: CompteAchatBreakdownItem[];
  lineDetailsByKey: Map<string, CompteAchatLineDetail[]>;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type RawLigne = {
  product_id: string;
  product_packaging_id: string | null;
  qte_achat: number | string | null;
  vendeur_id?: string | null;
  prix_achat_unitaire?: number | null;
  montant_ligne_achat?: number | null;
  product?: unknown;
};

function montantFromLigne(L: RawLigne): number {
  const pr = one(
    L.product as {
      name?: string | null;
      ref_order_unit?: unknown;
      ref_sales_unit?: unknown;
      product_packaging?: unknown;
    } | null,
  );
  const display = buildLotProductDisplayInfo(pr ?? null, L.product_packaging_id);
  const qteAchat = num(L.qte_achat, 0);
  const pu =
    L.prix_achat_unitaire != null && Number.isFinite(Number(L.prix_achat_unitaire))
      ? Number(L.prix_achat_unitaire)
      : null;
  const qtyBase = qtyBaseFromLotLine(qteAchat, display);
  const montantStored =
    L.montant_ligne_achat != null && Number.isFinite(Number(L.montant_ligne_achat))
      ? Number(L.montant_ligne_achat)
      : null;
  return roundMoney(montantStored ?? montantLigneFromPu(pu, qtyBase) ?? 0);
}

function itemKey(kind: CompteAchatKind, vendeurId: string | null): string {
  if (kind === "vendeur" && vendeurId) return `vendeur:${vendeurId}`;
  return kind;
}

/** Calcule les achats comptables à générer pour un lot clôturé (produits uniquement, sans frais). */
export async function computeLotCompteBreakdown(
  supabase: SupabaseClient,
  lotId: string,
  supplierId: string,
): Promise<{ error: string } | CompteAchatBreakdownResult> {
  const [lignesRes, vendeursRes] = await Promise.all([
    supabase
      .from("commande_fournisseur_lot_ligne")
      .select(
        "id, product_id, product_packaging_id, qte_achat, vendeur_id, prix_achat_unitaire, montant_ligne_achat, product(id, name, ref_order_unit(label), ref_sales_unit(label), ref_purchase_unit(label), product_packaging(id, quantity, nom, nom_ar, ref_conditionnement(label), ref_sales_unit(label)))",
      )
      .eq("lot_id", lotId),
    supabase
      .from("ref_supplier_vendeur")
      .select("id")
      .eq("supplier_id", supplierId),
  ]);

  if (lignesRes.error) return { error: lignesRes.error.message };
  if (vendeursRes.error) return { error: vendeursRes.error.message };

  const lignes = (lignesRes.data ?? []) as RawLigne[];
  const isStation = (vendeursRes.data ?? []).length === 0;

  const parVendeur = new Map<string, number>();
  let lignesSansVendeur = 0;
  const lineDetailsByKey = new Map<string, CompteAchatLineDetail[]>();

  for (const L of lignes) {
    const montant = montantFromLigne(L);
    const pr = one(
      L.product as {
        name?: string | null;
        ref_purchase_unit?: { label?: string | null } | { label?: string | null }[] | null;
      } | null,
    );
    const productName =
      typeof pr?.name === "string" && pr.name.trim().length > 0 ? pr.name.trim() : "—";
    const puRaw = L.prix_achat_unitaire;
    const prix_unitaire =
      puRaw !== null && puRaw !== undefined && Number.isFinite(Number(puRaw))
        ? Number(puRaw)
        : null;
    const purchaseUnit = one(pr?.ref_purchase_unit ?? null);
    const udaLabelRaw =
      typeof purchaseUnit?.label === "string" ? purchaseUnit.label.trim() : "";
    const lineDetail: CompteAchatLineDetail = {
      product_id: String(L.product_id),
      product_name: productName,
      qte_achat: num(L.qte_achat, 0),
      prix_unitaire,
      uda_label: udaLabelRaw.length > 0 ? udaLabelRaw : null,
      montant,
    };

    const vid =
      L.vendeur_id != null && String(L.vendeur_id).length > 0 ? String(L.vendeur_id) : null;

    if (isStation || vid == null) {
      lignesSansVendeur += montant;
      const key = itemKey("station", null);
      const arr = lineDetailsByKey.get(key) ?? [];
      arr.push(lineDetail);
      lineDetailsByKey.set(key, arr);
    } else {
      parVendeur.set(vid, roundMoney((parVendeur.get(vid) ?? 0) + montant));
      const key = itemKey("vendeur", vid);
      const arr = lineDetailsByKey.get(key) ?? [];
      arr.push(lineDetail);
      lineDetailsByKey.set(key, arr);
    }
  }

  const items: CompteAchatBreakdownItem[] = [];

  if (isStation) {
    const montant = roundMoney(lignesSansVendeur);
    if (montant > 0) {
      items.push({ kind: "station", vendeur_id: null, montant_total: montant });
    }
  } else {
    for (const [vid, montant] of parVendeur) {
      if (montant > 0) {
        items.push({ kind: "vendeur", vendeur_id: vid, montant_total: montant });
      }
    }
  }

  return { items, lineDetailsByKey };
}

/** Vérifie si le lot a au moins un achat comptable déjà payé. */
export async function lotHasPaidAchats(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string } | { paid: boolean }> {
  const { data: achats, error } = await supabase
    .from("fournisseur_compte_achat")
    .select("id")
    .eq("lot_id", lotId);

  if (error) return { error: error.message };
  const ids = (achats ?? []).map((a) => String((a as { id: string }).id));
  if (ids.length === 0) return { paid: false };

  const { count, error: pe } = await supabase
    .from("fournisseur_paiement_achat")
    .select("achat_id", { count: "exact", head: true })
    .in("achat_id", ids);

  if (pe) return { error: pe.message };
  return { paid: (count ?? 0) > 0 };
}

/** Supprime les achats comptables impayés d'un lot. */
export async function deleteUnpaidAchatsForLot(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string } | { ok: true }> {
  const { data: achats, error } = await supabase
    .from("fournisseur_compte_achat")
    .select("id")
    .eq("lot_id", lotId);

  if (error) return { error: error.message };
  const ids = (achats ?? []).map((a) => String((a as { id: string }).id));
  if (ids.length === 0) return { ok: true };

  const { data: paidLinks, error: pe } = await supabase
    .from("fournisseur_paiement_achat")
    .select("achat_id")
    .in("achat_id", ids);

  if (pe) return { error: pe.message };
  const paidIds = new Set((paidLinks ?? []).map((r) => String((r as { achat_id: string }).achat_id)));
  const toDelete = ids.filter((id) => !paidIds.has(id));
  if (toDelete.length === 0) return { ok: true };

  const { error: de } = await supabase.from("fournisseur_compte_achat").delete().in("id", toDelete);
  if (de) return { error: de.message };
  return { ok: true };
}

/** Supprime tous les achats comptables d'un lot (réouverture). */
export async function deleteAllAchatsForLot(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string } | { ok: true }> {
  const { error } = await supabase.from("fournisseur_compte_achat").delete().eq("lot_id", lotId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Génère / met à jour les achats comptables après clôture. */
export async function syncCompteAchatsForLot(
  supabase: SupabaseClient,
  opts: { lotId: string; supplierId: string; dateCloture: string },
): Promise<{ error: string } | { ok: true }> {
  const breakdown = await computeLotCompteBreakdown(supabase, opts.lotId, opts.supplierId);
  if ("error" in breakdown) return { error: breakdown.error };

  const del = await deleteUnpaidAchatsForLot(supabase, opts.lotId);
  if ("error" in del) return { error: del.error };

  for (const item of breakdown.items) {
    const row = {
      lot_id: opts.lotId,
      supplier_id: opts.supplierId,
      vendeur_id: item.vendeur_id,
      kind: item.kind,
      montant_total: item.montant_total,
      date_cloture: opts.dateCloture,
    };

    if (item.kind === "vendeur" && item.vendeur_id) {
      const { data: existing } = await supabase
        .from("fournisseur_compte_achat")
        .select("id")
        .eq("lot_id", opts.lotId)
        .eq("kind", "vendeur")
        .eq("vendeur_id", item.vendeur_id)
        .maybeSingle();

      if (existing) {
        const { error: ue } = await supabase
          .from("fournisseur_compte_achat")
          .update({ montant_total: item.montant_total, date_cloture: opts.dateCloture })
          .eq("id", (existing as { id: string }).id);
        if (ue) return { error: ue.message };
      } else {
        const { error: ie } = await supabase.from("fournisseur_compte_achat").insert(row);
        if (ie) return { error: ie.message };
      }
      continue;
    }

    const { data: existing } = await supabase
      .from("fournisseur_compte_achat")
      .select("id")
      .eq("lot_id", opts.lotId)
      .eq("kind", "station")
      .maybeSingle();

    if (existing) {
      const { error: ue } = await supabase
        .from("fournisseur_compte_achat")
        .update({ montant_total: item.montant_total, date_cloture: opts.dateCloture })
        .eq("id", (existing as { id: string }).id);
      if (ue) return { error: ue.message };
    } else {
      const { error: ie } = await supabase.from("fournisseur_compte_achat").insert(row);
      if (ie) return { error: ie.message };
    }
  }

  return { ok: true };
}
