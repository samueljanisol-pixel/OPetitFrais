/** Tri et libellés catégorie produit — alignés récap commande / matrice lot. */

export type CategoryParsed = {
  label: string;
  sort_order: number | null;
};

/** Depuis `product.ref_category` (réf. Supabase objet ou tableau). */
export function parseCategoryFromRef(raw: unknown): CategoryParsed {
  const c = (Array.isArray(raw) ? raw[0] : raw) as
    | { label?: string; sort_order?: number | null }
    | null
    | undefined;
  if (!c || typeof c !== "object") {
    return { label: "", sort_order: null };
  }
  const lb = typeof c.label === "string" ? c.label.trim() : "";
  return { label: lb, sort_order: c.sort_order ?? null };
}

/** Libellé affichage liste (récap, matrice lot) : défaut « Sans catégorie ». */
export function categoryDisplayLabel(parsed: CategoryParsed): string {
  return parsed.label.length > 0 ? parsed.label : "Sans catégorie";
}

/** Même ordre que l’API GET commande : sort_order, label, nom produit, id ligne. */
export function compareByCategoryThenProductName(
  ca: CategoryParsed,
  cb: CategoryParsed,
  nameA: string,
  nameB: string,
  ligneIdA: string,
  ligneIdB: string,
): number {
  const oa = ca.sort_order ?? 0;
  const ob = cb.sort_order ?? 0;
  if (oa !== ob) return oa - ob;
  const lc = ca.label.localeCompare(cb.label, "fr");
  if (lc !== 0) return lc;
  const na = nameA.localeCompare(nameB, "fr");
  if (na !== 0) return na;
  return ligneIdA.localeCompare(ligneIdB, "fr");
}
