/** Valeur coalesce(product_packaging_id) de l’index unique lot_ligne. */
export const LOT_LIGNE_NULL_PACKAGING_COALESCE = "00000000-0000-0000-0000-000000000000";

/** Identifiant UUID (produit, conditionnement…) : trim + minuscules pour clés stables. */
export function normalizeEntityId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/** Clé métier produit + conditionnement (null = à l’unité). */
export function commandeLigneKey(productId: string, productPackagingId: string | null): string {
  const pid = normalizeEntityId(productId) ?? productId.trim();
  const pkg = normalizeProductPackagingId(productPackagingId);
  return `${pid}::${pkg ?? ""}`;
}

/** Clé alignée sur l’index Postgres `commande_fournisseur_lot_ligne_lot_product_pack_uniq`. */
export function lotLignePostgresUniqueKey(
  productId: string,
  productPackagingId: string | null | undefined,
): string {
  const pid = normalizeEntityId(productId);
  if (!pid) {
    return "";
  }
  const pkg = normalizeProductPackagingId(productPackagingId);
  const coalesced = pkg ?? LOT_LIGNE_NULL_PACKAGING_COALESCE;
  return `${pid}::${coalesced}`;
}

/** Alias lot / commande (même granularité). */
export const lotLigneKey = commandeLigneKey;

export function normalizeProductPackagingId(
  raw: string | null | undefined,
): string | null {
  const id = normalizeEntityId(raw);
  if (!id || id === LOT_LIGNE_NULL_PACKAGING_COALESCE) {
    return null;
  }
  return id;
}

export type LotLigneInsertRow = {
  lot_id: string;
  product_id: string;
  product_packaging_id?: string | null;
  qte_achat: number;
  vendeur_id?: string | null;
};

/** Fusionne les lignes lot identiques (produit + conditionnement) avant insert SQL. */
export function dedupeLotLigneInserts<T extends LotLigneInsertRow>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const pid = normalizeEntityId(row.product_id);
    if (!pid) {
      continue;
    }
    const pkg = normalizeProductPackagingId(row.product_packaging_id);
    const key = lotLignePostgresUniqueKey(pid, pkg);
    const prev = map.get(key);
    if (prev) {
      prev.qte_achat = (Number(prev.qte_achat) || 0) + (Number(row.qte_achat) || 0);
      continue;
    }
    map.set(key, {
      ...row,
      product_id: pid,
      product_packaging_id: pkg,
    });
  }
  return [...map.values()];
}

export function hasDuplicateCommandeLignes(
  lignes: ReadonlyArray<{ productId: string; productPackagingId: string | null; qte?: number }>,
): boolean {
  const seen = new Set<string>();
  for (const l of lignes) {
    if (typeof l.qte === "number" && l.qte <= 0) {
      continue;
    }
    const key = commandeLigneKey(l.productId, l.productPackagingId);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}
