/** Tri et libellés catégorie produit — alignés récap commande / matrice lot. */

import type { AppLocale } from "@/i18n/config";

export type CategoryParsed = {
  label: string;
  labelAr?: string;
  sort_order: number | null;
};

/** Depuis `product.ref_category` (réf. Supabase objet ou tableau). */
export function parseCategoryFromRef(raw: unknown): CategoryParsed {
  const c = (Array.isArray(raw) ? raw[0] : raw) as
    | { label?: string; label_ar?: string | null; sort_order?: number | null }
    | null
    | undefined;
  if (!c || typeof c !== "object") {
    return { label: "", sort_order: null };
  }
  const lb = typeof c.label === "string" ? c.label.trim() : "";
  const ar = typeof c.label_ar === "string" ? c.label_ar.trim() : "";
  return {
    label: lb,
    ...(ar.length > 0 ? { labelAr: ar } : {}),
    sort_order: c.sort_order ?? null,
  };
}

/** Libellé affichage liste (récap, matrice lot) : défaut « Sans catégorie ». */
export function categoryDisplayLabel(parsed: CategoryParsed): string {
  return parsed.label.length > 0 ? parsed.label : "Sans catégorie";
}

/** Libellé catégorie selon locale d’export (arabe si `label_ar` renseigné). */
export function categoryDisplayLabelForLocale(
  parsed: CategoryParsed,
  locale: AppLocale,
  noCategoryLabel: string,
): string {
  if (locale === "ar-MA") {
    const ar = parsed.labelAr?.trim() ?? "";
    if (ar.length > 0) {
      return ar;
    }
  }
  if (parsed.label.length > 0) {
    return parsed.label;
  }
  return noCategoryLabel;
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
