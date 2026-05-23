import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeLotLigneInserts,
  lotLignePostgresUniqueKey,
  normalizeEntityId,
  normalizeProductPackagingId,
  type LotLigneInsertRow,
} from "@/lib/commandes-fournisseur/commande-ligne-key";

function lotLigneConstraintMessage(msg: string): string | null {
  if (msg.includes("commande_fournisseur_lot_ligne_lot_id_product_id_key")) {
    return (
      "Impossible de créer le lot : la base utilise encore l’ancienne règle « un produit par lot ». " +
      "Appliquez les migrations supabase (dont 20260625120000 et 20260626120000), puis réessayez."
    );
  }
  if (msg.includes("commande_fournisseur_lot_ligne_lot_product_pack_uniq")) {
    return (
      "Impossible de créer le lot : doublon produit + conditionnement. " +
      "Exécutez supabase/migrations/20260626130000_lot_ligne_upsert_rpc_on_conflict.sql dans Supabase SQL Editor, puis réessayez."
    );
  }
  if (msg.includes("upsert_commande_fournisseur_lot_ligne")) {
    return (
      "Fonction upsert lot manquante en base. Exécutez la migration " +
      "supabase/migrations/20260626120000_lot_ligne_upsert_rpc.sql dans Supabase SQL Editor."
    );
  }
  return null;
}

/**
 * Nécessite le client service_role et la migration 20260626120000.
 */
export async function insertLotLignesMerged(
  supabase: SupabaseClient,
  lotId: string,
  rows: LotLigneInsertRow[],
): Promise<{ keyToLotLigneId: Map<string, string> } | { error: string }> {
  const keyToLotLigneId = new Map<string, string>();
  const mergedRows = dedupeLotLigneInserts(rows);

  for (const row of mergedRows) {
    const productId = normalizeEntityId(row.product_id);
    if (!productId) {
      continue;
    }
    const packagingId = normalizeProductPackagingId(row.product_packaging_id);
    const pgKey = lotLignePostgresUniqueKey(productId, packagingId);

    const cachedId = keyToLotLigneId.get(pgKey);
    if (cachedId) {
      const { error: ue } = await supabase.rpc("upsert_commande_fournisseur_lot_ligne", {
        p_lot_id: lotId,
        p_product_id: productId,
        p_product_packaging_id: packagingId,
        p_qte_achat: row.qte_achat,
        p_vendeur_id: row.vendeur_id ?? null,
      });
      if (ue) {
        const friendly = lotLigneConstraintMessage(ue.message ?? "");
        return { error: friendly ?? ue.message ?? "Erreur" };
      }
      keyToLotLigneId.set(pgKey, cachedId);
      continue;
    }

    const { data, error } = await supabase.rpc("upsert_commande_fournisseur_lot_ligne", {
      p_lot_id: lotId,
      p_product_id: productId,
      p_product_packaging_id: packagingId,
      p_qte_achat: row.qte_achat,
      p_vendeur_id: row.vendeur_id ?? null,
    });

    if (error) {
      const friendly = lotLigneConstraintMessage(error.message ?? "");
      return { error: friendly ?? error.message ?? "Insertion ligne lot impossible" };
    }

    const lotLigneId = typeof data === "string" ? data : null;
    if (!lotLigneId) {
      return { error: "Insertion ligne lot impossible (identifiant manquant)" };
    }

    keyToLotLigneId.set(pgKey, lotLigneId);
  }

  return { keyToLotLigneId };
}
