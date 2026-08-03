export const MAGASIN_SITE_TYPES = ["magasin", "cuisine", "autre"] as const;

export type MagasinSiteType = (typeof MAGASIN_SITE_TYPES)[number];

export const MAGASIN_SITE_TYPE_LABELS: Record<MagasinSiteType, string> = {
  magasin: "Magasin",
  cuisine: "Cuisine",
  autre: "Autre site",
};

export function isMagasinSiteType(value: unknown): value is MagasinSiteType {
  return typeof value === "string" && (MAGASIN_SITE_TYPES as readonly string[]).includes(value);
}

export function magasinSiteTypeLabel(type: MagasinSiteType): string {
  return MAGASIN_SITE_TYPE_LABELS[type];
}

/** Seuls les magasins de vente peuvent avoir des caisses ou être visibles vitrine. */
export function magasinSiteHasCaisses(type: MagasinSiteType): boolean {
  return type === "magasin";
}

export function magasinSiteHasVitrineFields(type: MagasinSiteType): boolean {
  return type === "magasin";
}
