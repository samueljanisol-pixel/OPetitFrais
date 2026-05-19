/**
 * Règles d’éligibilité vente / achat pour les lignes product_packaging et commande à l’unité.
 * Override magasin : si une ligne product_packaging_magasin existe pour le magasin, elle remplace les flags globaux.
 */

export type PackagingMagasinOverride = {
  magasin_id: string;
  sellable: boolean;
  purchasable: boolean;
};

export type PackagingMagasinOverrideRelation =
  | PackagingMagasinOverride
  | PackagingMagasinOverride[]
  | null
  | undefined;

export function normalizePackagingMagasinRows(
  raw: PackagingMagasinOverrideRelation,
): PackagingMagasinOverride[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function effectiveSellableForMagasin(
  packagingAvailableForSale: boolean | null | undefined,
  magasinId: string | null | undefined,
  relation: PackagingMagasinOverrideRelation,
): boolean {
  const base = packagingAvailableForSale !== false;
  if (!magasinId) return base;
  const rows = normalizePackagingMagasinRows(relation);
  const o = rows.find((r) => r.magasin_id === magasinId);
  if (o) return o.sellable;
  return base;
}

export function effectivePurchasableForMagasin(
  packagingAvailableForPurchase: boolean | null | undefined,
  magasinId: string | null | undefined,
  relation: PackagingMagasinOverrideRelation,
): boolean {
  const base = packagingAvailableForPurchase !== false;
  if (!magasinId) return base;
  const rows = normalizePackagingMagasinRows(relation);
  const o = rows.find((r) => r.magasin_id === magasinId);
  if (o) return o.purchasable;
  return base;
}

export type ProductPackagingForFilter = {
  id: string;
  available_for_sale?: boolean | null;
  available_for_purchase?: boolean | null;
  product_packaging_magasin?: PackagingMagasinOverrideRelation;
};

export function filterPackagingForCommandePurchase<T extends ProductPackagingForFilter>(
  packs: T[] | null | undefined,
  magasinId: string | null | undefined,
): T[] {
  const list = packs ?? [];
  return list.filter((pp) =>
    effectivePurchasableForMagasin(pp.available_for_purchase, magasinId, pp.product_packaging_magasin),
  );
}

export function filterPackagingForRetailSale<T extends ProductPackagingForFilter>(
  packs: T[] | null | undefined,
  magasinId: string | null | undefined,
): T[] {
  const list = packs ?? [];
  return list.filter((pp) =>
    effectiveSellableForMagasin(pp.available_for_sale, magasinId, pp.product_packaging_magasin),
  );
}

export function commandeAllowsUnitProduct(allowUnitInCommande: boolean | null | undefined): boolean {
  return allowUnitInCommande !== false;
}
