import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeLotCompteBreakdown,
  type CompteAchatKind,
} from "@/lib/commandes-fournisseur/compte-lot-breakdown";
import {
  isSoleVendeurKey,
  SUPPLIER_SOLE_VENDEUR_KEY,
  vendeurIdFromKey,
} from "@/lib/commandes-fournisseur/achat-vendeur-key";
import { ensureLotAchatEnCours, isLotAchatEditable } from "@/lib/commandes-fournisseur/lot-status-achat";
import { enqueueProductActualisationAfterPurchase } from "@/lib/products/actualisation";

export type VendeurClotureLineIssue = {
  lotLigneId: string;
  productName: string | null;
};

export async function cloturerVendeurAchat(
  supabase: SupabaseClient,
  opts: {
    lotId: string;
    supplierId: string;
    vendeurKey: string;
  },
): Promise<
  | { ok: true }
  | {
      error: string;
      status: number;
      code?: string;
      missingPuLines?: VendeurClotureLineIssue[];
      missingQtyLines?: VendeurClotureLineIssue[];
    }
> {
  const { lotId, supplierId, vendeurKey } = opts;
  const sole = isSoleVendeurKey(vendeurKey);
  const vendeurId = vendeurIdFromKey(vendeurKey);

  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return { error: lotErr.message, status: 500 };
  if (!lot) return { error: "Introuvable", status: 404 };
  if (!isLotAchatEditable((lot as { status: string }).status)) {
    return { error: "Seul un lot « prêt » ou « achat en cours » permet de clôturer un vendeur", status: 409 };
  }

  const { data: existingState } = await supabase
    .from("commande_fournisseur_lot_vendeur_achat")
    .select("status")
    .eq("lot_id", lotId)
    .eq("vendeur_key", vendeurKey)
    .maybeSingle();
  if (existingState && (existingState as { status: string }).status === "cloture") {
    return { error: "Ce vendeur est déjà clôturé", status: 409 };
  }

  let lignesQuery = supabase
    .from("commande_fournisseur_lot_ligne")
    .select(
      "id, product_id, qte_achat, prix_achat_unitaire, montant_ligne_achat, vendeur_id, product(name)",
    )
    .eq("lot_id", lotId);

  if (sole) {
    // Station : toutes les lignes
  } else if (vendeurId) {
    lignesQuery = lignesQuery.eq("vendeur_id", vendeurId);
  } else {
    return { error: "vendeurKey invalide", status: 400 };
  }

  const { data: lignes, error } = await lignesQuery;
  if (error || !lignes) {
    return { error: error?.message ?? "Lignes introuvables", status: 500 };
  }
  if (lignes.length === 0) {
    return { error: "Aucune ligne pour ce vendeur", status: 400 };
  }

  const listeQteManquante: VendeurClotureLineIssue[] = [];
  const listePuVide: VendeurClotureLineIssue[] = [];

  for (const L of lignes) {
    const lid = String((L as { id: string }).id);
    const name = extractNestedProductName(L as Record<string, unknown>);
    const rawQte = (L as { qte_achat?: number | null }).qte_achat;
    const pu = (L as { prix_achat_unitaire?: number | null }).prix_achat_unitaire;
    const puMissing = pu === null || pu === undefined || Number.isNaN(Number(pu));

    if (rawQte == null) {
      listeQteManquante.push({ lotLigneId: lid, productName: name });
      continue;
    }
    const qaa = Number(rawQte);
    if (!Number.isFinite(qaa) || qaa < 0) {
      listeQteManquante.push({ lotLigneId: lid, productName: name });
      continue;
    }
    if (qaa === 0) {
      if (puMissing) {
        // Legacy / pas encore saisi (0 en base sans PU) ≠ « pas acheté »
        listeQteManquante.push({ lotLigneId: lid, productName: name });
      }
      // Qté 0 explicite = pas acheté, déjà confirmé par la saisie — hors compte
      continue;
    }
    if (puMissing) {
      listePuVide.push({ lotLigneId: lid, productName: name });
    }
  }

  if (listeQteManquante.length > 0) {
    return {
      error: "Quantité manquante sur une ou plusieurs lignes",
      status: 400,
      missingQtyLines: listeQteManquante,
    };
  }

  if (listePuVide.length > 0) {
    return {
      error: "Prix unitaire manquant sur une ou plusieurs lignes",
      status: 400,
      missingPuLines: listePuVide,
    };
  }

  for (const L of lignes) {
    const qaa = Number((L as { qte_achat?: number | null }).qte_achat);
    if (!Number.isFinite(qaa) || qaa <= 0) continue;
    const pu = Number((L as { prix_achat_unitaire: number }).prix_achat_unitaire);
    const pid = String((L as { product_id: string }).product_id);
    if (!(pu > 0)) continue;

    const { data: prod, error: prodErr } = await supabase
      .from("product")
      .select("cost_purchase, active, price, cost_manufacturing, cost_packaging, margin")
      .eq("id", pid)
      .maybeSingle();
    if (prodErr) return { error: prodErr.message, status: 500 };
    if (!prod) return { error: `Produit introuvable (${pid})`, status: 404 };

    const productActive = Boolean((prod as { active?: boolean }).active);
    const productPrice = Number((prod as { price?: number }).price) || 0;
    const costManufacturing =
      (prod as { cost_manufacturing?: number | null }).cost_manufacturing ?? null;
    const costPackaging = (prod as { cost_packaging?: number | null }).cost_packaging ?? null;
    const margin = (prod as { margin?: number | null }).margin ?? null;

    const enq = await enqueueProductActualisationAfterPurchase(supabase, {
      productId: pid,
      lotId,
      supplierId,
      newCostPurchase: pu,
      productActive,
      productPrice,
      costManufacturing,
      costPackaging,
      margin,
    });
    if ("error" in enq) return { error: enq.error, status: 500 };

    const { error: pe } = await supabase.from("product").update({ cost_purchase: pu }).eq("id", pid);
    if (pe) return { error: pe.message, status: 500 };
  }

  const dateCloture = new Date().toISOString();
  const sync = await syncCompteAchatForVendeur(supabase, {
    lotId,
    supplierId,
    vendeurKey: sole ? SUPPLIER_SOLE_VENDEUR_KEY : vendeurKey,
    dateCloture,
  });
  if ("error" in sync) return { error: sync.error, status: 500 };

  const marked = await ensureLotAchatEnCours(supabase, lotId);
  if ("error" in marked) return { error: marked.error, status: 500 };

  const { error: ue } = await supabase.from("commande_fournisseur_lot_vendeur_achat").upsert(
    {
      lot_id: lotId,
      vendeur_key: vendeurKey,
      vendeur_id: vendeurId,
      status: "cloture",
      marque_cloture_at: dateCloture,
      updated_at: dateCloture,
    },
    { onConflict: "lot_id,vendeur_key" },
  );
  if (ue) return { error: ue.message, status: 500 };

  return { ok: true };
}

export async function rouvrirVendeurAchat(
  supabase: SupabaseClient,
  opts: { lotId: string; vendeurKey: string },
): Promise<{ ok: true } | { error: string; status: number }> {
  const { lotId, vendeurKey } = opts;

  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return { error: lotErr.message, status: 500 };
  if (!lot) return { error: "Introuvable", status: 404 };
  if (!isLotAchatEditable((lot as { status: string }).status)) {
    return { error: "Rouverture vendeur uniquement sur un lot « prêt » ou « achat en cours »", status: 409 };
  }

  const paid = await vendeurAchatIsPaid(supabase, { lotId, vendeurKey });
  if ("error" in paid) return { error: paid.error, status: 500 };
  if (paid.paid) {
    return { error: "Achat déjà payé : réouverture impossible", status: 403 };
  }

  const del = await deleteCompteAchatForVendeur(supabase, { lotId, vendeurKey });
  if ("error" in del) return { error: del.error, status: 500 };

  const now = new Date().toISOString();
  const { error: ue } = await supabase.from("commande_fournisseur_lot_vendeur_achat").upsert(
    {
      lot_id: lotId,
      vendeur_key: vendeurKey,
      vendeur_id: vendeurIdFromKey(vendeurKey),
      status: "ouvert",
      marque_cloture_at: null,
      updated_at: now,
    },
    { onConflict: "lot_id,vendeur_key" },
  );
  if (ue) return { error: ue.message, status: 500 };

  return { ok: true };
}

/** Liste des vendeur_key encore ouverts (ayant des lignes) sur le lot. */
export async function listOpenVendeurKeysForLot(
  supabase: SupabaseClient,
  opts: { lotId: string; supplierId: string },
): Promise<{ error: string } | { openKeys: string[]; labels: Record<string, string> }> {
  const [lignesRes, vendeursRes, statesRes] = await Promise.all([
    supabase
      .from("commande_fournisseur_lot_ligne")
      .select("vendeur_id")
      .eq("lot_id", opts.lotId),
    supabase
      .from("ref_supplier_vendeur")
      .select("id, label")
      .eq("supplier_id", opts.supplierId),
    supabase
      .from("commande_fournisseur_lot_vendeur_achat")
      .select("vendeur_key, status")
      .eq("lot_id", opts.lotId),
  ]);
  if (lignesRes.error) return { error: lignesRes.error.message };
  if (vendeursRes.error) return { error: vendeursRes.error.message };
  if (statesRes.error) return { error: statesRes.error.message };

  const vendeurs = (vendeursRes.data ?? []) as Array<{ id: string; label: string }>;
  const isStation = vendeurs.length === 0;
  const closed = new Set(
    ((statesRes.data ?? []) as Array<{ vendeur_key: string; status: string }>)
      .filter((s) => s.status === "cloture")
      .map((s) => s.vendeur_key),
  );

  const labels: Record<string, string> = {};
  for (const v of vendeurs) labels[v.id] = v.label;

  if (isStation) {
    const hasLines = (lignesRes.data ?? []).length > 0;
    const openKeys =
      !hasLines || closed.has(SUPPLIER_SOLE_VENDEUR_KEY) ? [] : [SUPPLIER_SOLE_VENDEUR_KEY];
    labels[SUPPLIER_SOLE_VENDEUR_KEY] = "Station";
    return { openKeys, labels };
  }

  const keys = new Set<string>();
  for (const L of lignesRes.data ?? []) {
    const vid = (L as { vendeur_id?: string | null }).vendeur_id;
    if (vid != null && String(vid).length > 0) keys.add(String(vid));
  }

  const openKeys = [...keys].filter((k) => !closed.has(k));
  return { openKeys, labels };
}

/** Upsert un seul achat comptable pour un vendeur (ou Station). */
export async function syncCompteAchatForVendeur(
  supabase: SupabaseClient,
  opts: {
    lotId: string;
    supplierId: string;
    vendeurKey: string;
    dateCloture: string;
  },
): Promise<{ error: string } | { ok: true; montantTotal: number }> {
  const breakdown = await computeLotCompteBreakdown(supabase, opts.lotId, opts.supplierId);
  if ("error" in breakdown) return { error: breakdown.error };

  const kind: CompteAchatKind = isSoleVendeurKey(opts.vendeurKey) ? "station" : "vendeur";
  const vendeurId = vendeurIdFromKey(opts.vendeurKey);

  const item = breakdown.items.find((it) => {
    if (kind === "station") return it.kind === "station";
    return it.kind === "vendeur" && it.vendeur_id === vendeurId;
  });

  const montantTotal = item?.montant_total ?? 0;

  if (kind === "vendeur" && vendeurId) {
    const { data: existing } = await supabase
      .from("fournisseur_compte_achat")
      .select("id")
      .eq("lot_id", opts.lotId)
      .eq("kind", "vendeur")
      .eq("vendeur_id", vendeurId)
      .maybeSingle();

    if (montantTotal <= 0) {
      if (existing) {
        const paid = await achatIsPaid(supabase, String((existing as { id: string }).id));
        if ("error" in paid) return { error: paid.error };
        if (paid.paid) {
          return { error: "Achat déjà payé : impossible de retirer l'écriture" };
        }
        const { error: de } = await supabase
          .from("fournisseur_compte_achat")
          .delete()
          .eq("id", (existing as { id: string }).id);
        if (de) return { error: de.message };
      }
      return { ok: true, montantTotal: 0 };
    }

    const row = {
      lot_id: opts.lotId,
      supplier_id: opts.supplierId,
      vendeur_id: vendeurId,
      kind: "vendeur" as const,
      montant_total: montantTotal,
      date_cloture: opts.dateCloture,
    };

    if (existing) {
      const paid = await achatIsPaid(supabase, String((existing as { id: string }).id));
      if ("error" in paid) return { error: paid.error };
      if (paid.paid) {
        return { error: "Achat déjà payé : montant non modifiable" };
      }
      const { error: ue } = await supabase
        .from("fournisseur_compte_achat")
        .update({ montant_total: montantTotal, date_cloture: opts.dateCloture })
        .eq("id", (existing as { id: string }).id);
      if (ue) return { error: ue.message };
    } else {
      const { error: ie } = await supabase.from("fournisseur_compte_achat").insert(row);
      if (ie) return { error: ie.message };
    }
    return { ok: true, montantTotal };
  }

  // Station
  const { data: existing } = await supabase
    .from("fournisseur_compte_achat")
    .select("id")
    .eq("lot_id", opts.lotId)
    .eq("kind", "station")
    .maybeSingle();

  if (montantTotal <= 0) {
    if (existing) {
      const paid = await achatIsPaid(supabase, String((existing as { id: string }).id));
      if ("error" in paid) return { error: paid.error };
      if (paid.paid) {
        return { error: "Achat déjà payé : impossible de retirer l'écriture" };
      }
      const { error: de } = await supabase
        .from("fournisseur_compte_achat")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (de) return { error: de.message };
    }
    return { ok: true, montantTotal: 0 };
  }

  const row = {
    lot_id: opts.lotId,
    supplier_id: opts.supplierId,
    vendeur_id: null,
    kind: "station" as const,
    montant_total: montantTotal,
    date_cloture: opts.dateCloture,
  };

  if (existing) {
    const paid = await achatIsPaid(supabase, String((existing as { id: string }).id));
    if ("error" in paid) return { error: paid.error };
    if (paid.paid) {
      return { error: "Achat déjà payé : montant non modifiable" };
    }
    const { error: ue } = await supabase
      .from("fournisseur_compte_achat")
      .update({ montant_total: montantTotal, date_cloture: opts.dateCloture })
      .eq("id", (existing as { id: string }).id);
    if (ue) return { error: ue.message };
  } else {
    const { error: ie } = await supabase.from("fournisseur_compte_achat").insert(row);
    if (ie) return { error: ie.message };
  }
  return { ok: true, montantTotal };
}

export async function deleteCompteAchatForVendeur(
  supabase: SupabaseClient,
  opts: { lotId: string; vendeurKey: string },
): Promise<{ error: string } | { ok: true }> {
  const kind: CompteAchatKind = isSoleVendeurKey(opts.vendeurKey) ? "station" : "vendeur";
  const vendeurId = vendeurIdFromKey(opts.vendeurKey);

  let q = supabase
    .from("fournisseur_compte_achat")
    .select("id")
    .eq("lot_id", opts.lotId)
    .eq("kind", kind);

  if (kind === "vendeur" && vendeurId) {
    q = q.eq("vendeur_id", vendeurId);
  }

  const { data: existing, error } = await q.maybeSingle();
  if (error) return { error: error.message };
  if (!existing) return { ok: true };

  const paid = await achatIsPaid(supabase, String((existing as { id: string }).id));
  if ("error" in paid) return { error: paid.error };
  if (paid.paid) {
    return { error: "Achat déjà payé : réouverture impossible" };
  }

  const { error: de } = await supabase
    .from("fournisseur_compte_achat")
    .delete()
    .eq("id", (existing as { id: string }).id);
  if (de) return { error: de.message };
  return { ok: true };
}

export async function vendeurAchatIsPaid(
  supabase: SupabaseClient,
  opts: { lotId: string; vendeurKey: string },
): Promise<{ error: string } | { paid: boolean }> {
  const kind: CompteAchatKind = isSoleVendeurKey(opts.vendeurKey) ? "station" : "vendeur";
  const vendeurId = vendeurIdFromKey(opts.vendeurKey);

  let q = supabase
    .from("fournisseur_compte_achat")
    .select("id")
    .eq("lot_id", opts.lotId)
    .eq("kind", kind);

  if (kind === "vendeur" && vendeurId) {
    q = q.eq("vendeur_id", vendeurId);
  }

  const { data: existing, error } = await q.maybeSingle();
  if (error) return { error: error.message };
  if (!existing) return { paid: false };
  return achatIsPaid(supabase, String((existing as { id: string }).id));
}

async function achatIsPaid(
  supabase: SupabaseClient,
  achatId: string,
): Promise<{ error: string } | { paid: boolean }> {
  const { count, error } = await supabase
    .from("fournisseur_paiement_achat")
    .select("achat_id", { count: "exact", head: true })
    .eq("achat_id", achatId);
  if (error) return { error: error.message };
  return { paid: (count ?? 0) > 0 };
}

function extractNestedProductName(raw: Record<string, unknown>): string | null {
  const p = raw["product"] as { name?: string } | { name?: string }[] | null | undefined;
  if (!p) return null;
  const one = Array.isArray(p) ? p[0] : p;
  return typeof one?.name === "string" ? one.name : null;
}
