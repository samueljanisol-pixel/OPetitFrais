import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProductPackagingId } from "@/lib/commandes-fournisseur/commande-ligne-key";
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";

type CommandeMagasinRef = {
  commandeId: string;
  magasinId: string;
};

/** commande_id → magasin_id pour les commandes du lot. */
export async function commandeMagasinRefsForLot(
  supabase: SupabaseClient,
  lotId: string,
): Promise<CommandeMagasinRef[]> {
  const { data: incs, error: ie } = await supabase
    .from("commande_fournisseur_lot_inclusion")
    .select("commande_id")
    .eq("lot_id", lotId);
  if (ie) {
    return [];
  }
  const commandeIds = [
    ...new Set(
      (incs ?? [])
        .map((r) => (r as { commande_id?: string }).commande_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (commandeIds.length === 0) {
    return [];
  }

  const { data: commandes, error: ce } = await supabase
    .from("commande_fournisseur")
    .select("id, magasin_id")
    .in("id", commandeIds);
  if (ce || !commandes) {
    return [];
  }

  const out: CommandeMagasinRef[] = [];
  for (const row of commandes) {
    const commandeId = (row as { id?: string }).id;
    const magasinId = (row as { magasin_id?: string }).magasin_id;
    if (typeof commandeId === "string" && commandeId.length > 0 && typeof magasinId === "string" && magasinId.length > 0) {
      out.push({ commandeId, magasinId });
    }
  }
  return out;
}

/**
 * Aligne `commande_fournisseur_ligne` sur les qtés matrice lot (magasin > 0)
 * pour permettre commentaires consolidation par magasin.
 */
export async function syncCommandeLignesFromLotMagasinQty(
  supabase: SupabaseClient,
  lotId: string,
  lotStatus: string,
): Promise<void> {
  if (lotStatus !== "brouillon" && lotStatus !== "prevalidation") {
    return;
  }

  const refs = await commandeMagasinRefsForLot(supabase, lotId);
  if (refs.length === 0) {
    return;
  }

  const magasinToCommande = new Map(refs.map((r) => [r.magasinId, r.commandeId]));

  const { data: lotLignes, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select(
      "id, product_id, product_packaging_id, commande_fournisseur_lot_ligne_magasin(magasin_id, qte)",
    )
    .eq("lot_id", lotId);
  if (le || !lotLignes) {
    return;
  }

  for (const ll of lotLignes) {
    const productId = (ll as { product_id?: string }).product_id;
    const packagingId = normalizeProductPackagingId(
      (ll as { product_packaging_id?: string | null }).product_packaging_id,
    );
    if (!productId) {
      continue;
    }
    const mags = (ll as { commande_fournisseur_lot_ligne_magasin?: unknown[] })
      .commande_fournisseur_lot_ligne_magasin;
    for (const raw of mags ?? []) {
      const magRow = raw as { magasin_id?: string; qte?: string | number };
      const magasinId = magRow.magasin_id;
      if (!magasinId) {
        continue;
      }
      const qteRaw = magRow.qte;
      const qteN = typeof qteRaw === "string" ? parseFloat(qteRaw) : Number(qteRaw);
      if (!Number.isFinite(qteN) || qteN <= 0) {
        continue;
      }
      const commandeId = magasinToCommande.get(magasinId);
      if (!commandeId) {
        continue;
      }

      let exQuery = supabase
        .from("commande_fournisseur_ligne")
        .select("id, qte")
        .eq("commande_id", commandeId)
        .eq("product_id", productId);
      if (packagingId) {
        exQuery = exQuery.eq("product_packaging_id", packagingId);
      } else {
        exQuery = exQuery.is("product_packaging_id", null);
      }
      const { data: existing, error: exErr } = await exQuery.maybeSingle();
      if (exErr) {
        continue;
      }
      if (existing) {
        continue;
      }

      await supabase.from("commande_fournisseur_ligne").insert({
        commande_id: commandeId,
        product_id: productId,
        product_packaging_id: packagingId,
        qte: clampQtyToApiRange(qteN),
        line_comment: null,
      });
    }
  }
}
