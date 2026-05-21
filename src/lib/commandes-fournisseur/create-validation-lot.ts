import type { SupabaseClient } from "@supabase/supabase-js";
import {
  commandeLigneKey,
  normalizeProductPackagingId,
} from "@/lib/commandes-fournisseur/commande-ligne-key";
import { vendeurIdsByProductIds } from "@/lib/commandes-fournisseur/product-vendeur";
import { fallbackStatusLabel } from "@/lib/statusLabels/defaults";

type LotAggCell = {
  productId: string;
  packagingId: string | null;
  total: number;
  byMag: Map<string, number>;
};

/**
 * Crée un lot, rattache les commandes validées, agrège les lignes (par produit + conditionnement + magasin),
 * met les commandes en statut integree.
 */
export async function createValidationLot(
  supabase: SupabaseClient,
  userId: string,
  commandeIds: string[],
): Promise<{ lotId: string } | { error: string }> {
  if (commandeIds.length === 0) {
    return { error: "Sélectionnez au moins une commande" };
  }
  const unique = [...new Set(commandeIds)];

  const { data: commandes, error: ce } = await supabase
    .from("commande_fournisseur")
    .select("id, supplier_id, status, lot_id, magasin_id")
    .in("id", unique);

  if (ce) {
    return { error: ce.message };
  }
  if (!commandes || commandes.length !== unique.length) {
    return { error: "Commande(s) introuvable(s)" };
  }

  const suppliers = new Set(commandes.map((c) => c.supplier_id as string));
  if (suppliers.size !== 1) {
    return { error: "Toutes les commandes doivent être du même fournisseur" };
  }
  for (const c of commandes) {
    if (c.status !== "validee") {
      return {
        error: `Seules les commandes au statut « ${fallbackStatusLabel("commande_fournisseur", "validee")} » peuvent entrer dans un lot`,
      };
    }
    if (c.lot_id) {
      return { error: "Une commande est déjà rattachée à un lot" };
    }
  }

  const supplierId = commandes[0]!.supplier_id as string;
  const magByCmd = new Map(commandes.map((c) => [c.id as string, c.magasin_id as string]));

  const { data: lotRow, error: le } = await supabase
    .from("commande_fournisseur_lot")
    .insert({
      supplier_id: supplierId,
      status: "brouillon",
      created_by: userId,
    })
    .select("id")
    .single();
  if (le || !lotRow) {
    return { error: le?.message ?? "Création du lot impossible" };
  }
  const lotId = lotRow.id as string;

  const inclusions = unique.map((commandeId) => ({ lot_id: lotId, commande_id: commandeId }));
  const { error: ie } = await supabase.from("commande_fournisseur_lot_inclusion").insert(inclusions);
  if (ie) {
    await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: ie.message };
  }

  const { data: lignes, error: ligErr } = await supabase
    .from("commande_fournisseur_ligne")
    .select("commande_id, product_id, product_packaging_id, qte")
    .in("commande_id", unique);
  if (ligErr) {
    await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: ligErr.message };
  }

  const byLineKey = new Map<string, LotAggCell>();
  for (const row of lignes ?? []) {
    const pid = row.product_id as string;
    const packagingId = normalizeProductPackagingId(
      (row as { product_packaging_id?: string | null }).product_packaging_id,
    );
    const key = commandeLigneKey(pid, packagingId);
    const q = Number(row.qte) || 0;
    const mid = magByCmd.get(row.commande_id as string);
    if (!mid) continue;
    let cell = byLineKey.get(key);
    if (!cell) {
      cell = { productId: pid, packagingId, total: 0, byMag: new Map() };
      byLineKey.set(key, cell);
    }
    cell.total += q;
    cell.byMag.set(mid, (cell.byMag.get(mid) ?? 0) + q);
  }

  const lineKeys = [...byLineKey.keys()];
  if (lineKeys.length === 0) {
    const { error: upErr } = await supabase
      .from("commande_fournisseur")
      .update({ lot_id: lotId, status: "integree" })
      .in("id", unique);
    if (upErr) {
      await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
      return { error: upErr.message };
    }
    return { lotId };
  }

  const productIds = [...new Set(lineKeys.map((k) => byLineKey.get(k)!.productId))];
  const vendeurByProduct = await vendeurIdsByProductIds(supabase, productIds, supplierId);

  const toInsertLignes = lineKeys.map((key) => {
    const cell = byLineKey.get(key)!;
    const vendeurId = vendeurByProduct.get(cell.productId) ?? null;
    return {
      lot_id: lotId,
      product_id: cell.productId,
      qte_achat: cell.total,
      ...(cell.packagingId ? { product_packaging_id: cell.packagingId } : {}),
      ...(vendeurId ? { vendeur_id: vendeurId } : {}),
    };
  });

  const { data: insLl, error: llErr } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .insert(toInsertLignes)
    .select("id, product_id, product_packaging_id");
  if (llErr || !insLl) {
    await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    const msg = llErr?.message ?? "Écriture des lignes lot impossible";
    if (msg.includes("commande_fournisseur_lot_ligne_lot_id_product_id_key")) {
      return {
        error:
          "Impossible de créer le lot : la base utilise encore l’ancienne règle « un produit par lot ». Appliquez la migration supabase/migrations/20260625120000_lot_ligne_unique_product_packaging.sql (Supabase SQL Editor ou supabase db push), puis réessayez.",
      };
    }
    return { error: msg };
  }

  const keyToLotLigne = new Map<string, string>();
  for (const r of insLl as { id: string; product_id: string; product_packaging_id?: string | null }[]) {
    keyToLotLigne.set(
      commandeLigneKey(r.product_id, normalizeProductPackagingId(r.product_packaging_id)),
      r.id,
    );
  }

  const magRows: { lot_ligne_id: string; magasin_id: string; qte: number }[] = [];
  for (const key of lineKeys) {
    const cell = byLineKey.get(key)!;
    const llId = keyToLotLigne.get(key);
    if (!llId) continue;
    for (const [magId, q] of cell.byMag) {
      if (q > 0) {
        magRows.push({ lot_ligne_id: llId, magasin_id: magId, qte: q });
      }
    }
  }

  if (magRows.length > 0) {
    const { error: mErr } = await supabase.from("commande_fournisseur_lot_ligne_magasin").insert(magRows);
    if (mErr) {
      await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
      return { error: mErr.message };
    }
  }

  const { error: upErr } = await supabase
    .from("commande_fournisseur")
    .update({ lot_id: lotId, status: "integree" })
    .in("id", unique);
  if (upErr) {
    await supabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: upErr.message };
  }

  return { lotId };
}
