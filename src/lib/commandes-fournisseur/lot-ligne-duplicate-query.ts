import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lotLigneProductPackKey,
  normalizeEntityId,
  normalizeProductPackagingId,
} from "@/lib/commandes-fournisseur/commande-ligne-key";

export type ExistingLotLigneMatch = {
  lotLigneId: string;
  productName: string | null;
  vendeurId: string | null;
  vendeurLabel: string | null;
};

function extractNestedProductName(raw: Record<string, unknown>): string | null {
  const p = raw["product"] as { name?: string } | { name?: string }[] | null | undefined;
  if (!p) return null;
  const one = Array.isArray(p) ? p[0] : p;
  return typeof one?.name === "string" ? one.name : null;
}

function vendeurLabelFromRow(
  row: Record<string, unknown>,
  vendeurLabels: Map<string, string>,
): string | null {
  const vendeurId = (row as { vendeur_id?: string | null }).vendeur_id;
  if (vendeurId == null || String(vendeurId).length === 0) {
    return null;
  }
  return vendeurLabels.get(String(vendeurId)) ?? String(vendeurId);
}

/** Ligne lot existante pour le même produit + conditionnement (clé index Postgres, tous vendeurs). */
export async function findExistingLotLigneId(
  supabase: SupabaseClient,
  lotId: string,
  productId: string,
  productPackagingId: string | null | undefined,
): Promise<{ id: string } | null> {
  const matches = await findExistingLotLignesForPackaging(
    supabase,
    lotId,
    productId,
    productPackagingId,
  );
  return matches[0] ? { id: matches[0].lotLigneId } : null;
}

/** Toutes les lignes lot pour le même produit + conditionnement (tous vendeurs). */
export async function findExistingLotLignesForPackaging(
  supabase: SupabaseClient,
  lotId: string,
  productId: string,
  productPackagingId: string | null | undefined,
): Promise<ExistingLotLigneMatch[]> {
  const pid = normalizeEntityId(productId);
  if (!pid) {
    return [];
  }
  const targetKey = lotLigneProductPackKey(pid, productPackagingId);

  const { data, error } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("id, product_id, product_packaging_id, vendeur_id, product(name)")
    .eq("lot_id", lotId)
    .eq("product_id", pid);

  if (error) {
    throw new Error(error.message);
  }

  const vendeurIds = new Set<string>();
  for (const row of data ?? []) {
    const vid = (row as { vendeur_id?: string | null }).vendeur_id;
    if (vid != null && String(vid).length > 0) {
      vendeurIds.add(String(vid));
    }
  }

  const vendeurLabels = new Map<string, string>();
  if (vendeurIds.size > 0) {
    const { data: vendeurs, error: vendeursErr } = await supabase
      .from("ref_supplier_vendeur")
      .select("id, label")
      .in("id", [...vendeurIds]);
    if (vendeursErr) {
      throw new Error(vendeursErr.message);
    }
    for (const v of vendeurs ?? []) {
      const id = String((v as { id: string }).id);
      const label = (v as { label?: string | null }).label;
      if (typeof label === "string" && label.trim().length > 0) {
        vendeurLabels.set(id, label.trim());
      }
    }
  }

  const items: ExistingLotLigneMatch[] = [];
  for (const row of data ?? []) {
    const r = row as {
      id: string;
      product_id: string;
      product_packaging_id?: string | null;
      vendeur_id?: string | null;
    };
    const key = lotLigneProductPackKey(r.product_id, r.product_packaging_id);
    if (key !== targetKey) continue;
    items.push({
      lotLigneId: r.id,
      productName: extractNestedProductName(row as Record<string, unknown>),
      vendeurId: r.vendeur_id ?? null,
      vendeurLabel: vendeurLabelFromRow(row as Record<string, unknown>, vendeurLabels),
    });
  }

  return items;
}
