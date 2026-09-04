import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  dedupeLotLigneInserts,
  lotLignePostgresUniqueKey,
  lotLigneProductPackKey,
  normalizeEntityId,
  normalizeProductPackagingId,
} from "@/lib/commandes-fournisseur/commande-ligne-key";
import { assertUniformDeliveryDates } from "@/lib/commandes-fournisseur/delivery-date";
import { insertLotLignesMerged } from "@/lib/commandes-fournisseur/insert-lot-lignes";
import { vendeurIdsByProductIds } from "@/lib/commandes-fournisseur/product-vendeur";
import { commandeMagasinRefsForLot } from "@/lib/commandes-fournisseur/sync-lot-magasin-lignes";
import { fallbackStatusLabel } from "@/lib/statusLabels/defaults";

type CommandeLigneQtyRow = {
  commande_id: string;
  product_id: string;
  product_packaging_id?: string | null;
  qte: unknown;
};

type LotAggCell = {
  productId: string;
  packagingId: string | null;
  total: number;
  byMag: Map<string, number>;
};

/** Agrège les lignes commande par (produit, conditionnement) et par magasin. */
export function aggregateCommandeLignesForLot(
  lignes: ReadonlyArray<CommandeLigneQtyRow>,
  magByCmd: Map<string, string>,
): Map<string, LotAggCell> {
  const byLineKey = new Map<string, LotAggCell>();
  for (const row of lignes) {
    const pid = normalizeEntityId(row.product_id);
    if (!pid) {
      continue;
    }
    const packagingId = normalizeProductPackagingId(row.product_packaging_id);
    const key = lotLigneProductPackKey(pid, packagingId);
    if (!key) {
      continue;
    }
    const q = Number(row.qte) || 0;
    const mid = magByCmd.get(row.commande_id);
    if (!mid) continue;
    let cell = byLineKey.get(key);
    if (!cell) {
      cell = { productId: pid, packagingId, total: 0, byMag: new Map() };
      byLineKey.set(key, cell);
    }
    cell.total += q;
    cell.byMag.set(mid, (cell.byMag.get(mid) ?? 0) + q);
  }
  return byLineKey;
}

function lotLigneIdForCell(
  keyToLotLigne: Map<string, string>,
  cell: LotAggCell,
  vendeurId: string | null,
): string | undefined {
  return keyToLotLigne.get(
    lotLignePostgresUniqueKey(cell.productId, cell.packagingId, vendeurId),
  );
}

/**
 * Recopie les qtés commande → matrice magasin pour les lignes lot encore sans répartition.
 * Corrige les lots créés avec le décalage de clé vendeur (affichage 0 partout).
 */
export async function backfillMissingLotMagasinQtyFromCommandes(
  supabase: SupabaseClient,
  lotId: string,
  lotStatus: string,
): Promise<boolean> {
  if (lotStatus !== "brouillon" && lotStatus !== "prevalidation") {
    return false;
  }

  const refs = await commandeMagasinRefsForLot(supabase, lotId);
  if (refs.length === 0) {
    return false;
  }

  const commandeIds = refs.map((r) => r.commandeId);
  const magByCmd = new Map(refs.map((r) => [r.commandeId, r.magasinId]));

  const { data: lignes, error: ligErr } = await supabase
    .from("commande_fournisseur_ligne")
    .select("commande_id, product_id, product_packaging_id, qte")
    .in("commande_id", commandeIds);
  if (ligErr || !lignes) {
    return false;
  }

  const byLineKey = aggregateCommandeLignesForLot(
    lignes as CommandeLigneQtyRow[],
    magByCmd,
  );
  if (byLineKey.size === 0) {
    return false;
  }

  const { data: lotLignes, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id, product_id, product_packaging_id, commande_fournisseur_lot_ligne_magasin(id)")
    .eq("lot_id", lotId);
  if (le || !lotLignes) {
    return false;
  }

  const magRows: { lot_ligne_id: string; magasin_id: string; qte: number }[] = [];
  for (const ll of lotLignes) {
    const existingMags = (
      ll as { commande_fournisseur_lot_ligne_magasin?: unknown[] | null }
    ).commande_fournisseur_lot_ligne_magasin;
    const existing = existingMags == null ? [] : Array.isArray(existingMags) ? existingMags : [existingMags];
    if (existing.length > 0) {
      continue;
    }
    const pid = normalizeEntityId((ll as { product_id?: string }).product_id);
    if (!pid) {
      continue;
    }
    const packagingId = normalizeProductPackagingId(
      (ll as { product_packaging_id?: string | null }).product_packaging_id,
    );
    const cell = byLineKey.get(lotLigneProductPackKey(pid, packagingId));
    if (!cell) {
      continue;
    }
    const lotLigneId = (ll as { id: string }).id;
    for (const [magId, q] of cell.byMag) {
      if (q > 0) {
        magRows.push({ lot_ligne_id: lotLigneId, magasin_id: magId, qte: q });
      }
    }
  }

  if (magRows.length === 0) {
    return false;
  }

  const { error: mErr } = await supabase.from("commande_fournisseur_lot_ligne_magasin").insert(magRows);
  return !mErr;
}

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
    .select("id, supplier_id, status, lot_id, magasin_id, date_livraison")
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

  const dateCheck = assertUniformDeliveryDates(
    commandes.map((c) => (c as { date_livraison?: string | null }).date_livraison),
  );
  if (!dateCheck.ok) {
    return { error: dateCheck.error };
  }
  const lotDateLivraison = dateCheck.date;

  const supplierId = commandes[0]!.supplier_id as string;
  const magByCmd = new Map(commandes.map((c) => [c.id as string, c.magasin_id as string]));

  let writeSupabase: SupabaseClient;
  try {
    writeSupabase = createSupabaseServiceRoleClient();
  } catch {
    return {
      error:
        "Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY). Impossible de créer le lot en toute sécurité.",
    };
  }

  const { data: lotRow, error: le } = await writeSupabase
    .from("commande_fournisseur_lot")
    .insert({
      supplier_id: supplierId,
      status: "brouillon",
      created_by: userId,
      ...(lotDateLivraison ? { date_livraison: lotDateLivraison } : {}),
    })
    .select("id")
    .single();
  if (le || !lotRow) {
    return { error: le?.message ?? "Création du lot impossible" };
  }
  const lotId = lotRow.id as string;

  const inclusions = unique.map((commandeId) => ({ lot_id: lotId, commande_id: commandeId }));
  const { error: ie } = await writeSupabase.from("commande_fournisseur_lot_inclusion").insert(inclusions);
  if (ie) {
    await writeSupabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: ie.message };
  }

  const { data: lignes, error: ligErr } = await supabase
    .from("commande_fournisseur_ligne")
    .select("commande_id, product_id, product_packaging_id, qte")
    .in("commande_id", unique);
  if (ligErr) {
    await writeSupabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: ligErr.message };
  }

  const byLineKey = aggregateCommandeLignesForLot(
    (lignes ?? []) as CommandeLigneQtyRow[],
    magByCmd,
  );

  const lineKeys = [...byLineKey.keys()];
  if (lineKeys.length === 0) {
    const { error: upErr } = await supabase
      .from("commande_fournisseur")
      .update({ lot_id: lotId, status: "integree" })
      .in("id", unique);
    if (upErr) {
      await writeSupabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
      return { error: upErr.message };
    }
    return { lotId };
  }

  const productIds = [...new Set(lineKeys.map((k) => byLineKey.get(k)!.productId))];
  const vendeurByProduct = await vendeurIdsByProductIds(writeSupabase, productIds, supplierId);

  const toInsertLignes = dedupeLotLigneInserts(
    lineKeys.map((key) => {
      const cell = byLineKey.get(key)!;
      const vendeurId = vendeurByProduct.get(cell.productId) ?? null;
      return {
        lot_id: lotId,
        product_id: cell.productId,
        product_packaging_id: cell.packagingId,
        qte_achat: cell.total,
        ...(vendeurId ? { vendeur_id: vendeurId } : {}),
      };
    }),
  );

  const insRes = await insertLotLignesMerged(writeSupabase, lotId, toInsertLignes);
  if ("error" in insRes) {
    await writeSupabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: insRes.error };
  }
  const keyToLotLigne = insRes.keyToLotLigneId;

  const magRows: { lot_ligne_id: string; magasin_id: string; qte: number }[] = [];
  for (const key of lineKeys) {
    const cell = byLineKey.get(key)!;
    const vendeurId = vendeurByProduct.get(cell.productId) ?? null;
    const llId = lotLigneIdForCell(keyToLotLigne, cell, vendeurId);
    if (!llId) continue;
    for (const [magId, q] of cell.byMag) {
      if (q > 0) {
        magRows.push({ lot_ligne_id: llId, magasin_id: magId, qte: q });
      }
    }
  }

  if (magRows.length > 0) {
    const { error: mErr } = await writeSupabase.from("commande_fournisseur_lot_ligne_magasin").insert(magRows);
    if (mErr) {
      await writeSupabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
      return { error: mErr.message };
    }
  }

  const { error: upErr } = await writeSupabase
    .from("commande_fournisseur")
    .update({ lot_id: lotId, status: "integree" })
    .in("id", unique);
  if (upErr) {
    await writeSupabase.from("commande_fournisseur_lot").delete().eq("id", lotId);
    return { error: upErr.message };
  }

  return { lotId };
}
