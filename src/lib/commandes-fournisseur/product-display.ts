/** Affichage unité / conditionnement / « Soit » — aligné sur la logique de l’API commandes (récap). */

import type { AppLocale } from "@/i18n/config";

type RefMini = { label?: string | null; label_ar?: string | null; code?: string | null };

function refMini(raw: unknown): RefMini | null {
  const o = (Array.isArray(raw) ? raw[0] : raw) as RefMini | null | undefined;
  return o ?? null;
}

export function labelFromRef(raw: unknown): string {
  const t = refMini(raw)?.label?.trim();
  return t ? String(t) : "—";
}

/** Libellé référentiel selon la locale UI (arabe si dispo). */
export function labelFromRefForLocale(raw: unknown, locale: AppLocale): string {
  const o = refMini(raw);
  if (!o) return "—";
  if (locale === "ar-MA") {
    const ar = o.label_ar?.trim();
    if (ar) return ar;
  }
  const t = o.label?.trim();
  return t ? String(t) : "—";
}

/** UdV conditionnement = référentiel « Unité » (colis compté en pièces). */
export function isPackSalesUnitUnite(raw: unknown): boolean {
  const o = refMini(raw);
  if (!o) return false;
  const label = (o.label ?? "").trim().toLowerCase();
  const code = (o.code ?? "").trim().toLowerCase();
  return label === "unité" || label === "unite" || code === "unite";
}

/** Libellé « unité » / « unités » pour la ligne « Soit … » (conditionnement UdV Unité). */
export function formatSoitUniteLabel(convertedQty: number): string {
  if (!Number.isFinite(convertedQty)) return "unité";
  return Math.abs(convertedQty) > 1 ? "unités" : "unité";
}

export function formatPackQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

export type PackagingRowForDisplay = {
  id: string;
  quantity: string | number;
  /** Nom personnalisé (product_packaging.nom) ; prioritaire sur ref_conditionnement.label. */
  nom?: string | null;
  /** Nom arabe personnalisé (product_packaging.nom_ar). */
  nom_ar?: string | null;
  ref_conditionnement?: unknown;
  ref_sales_unit?: unknown;
};

type PPack = PackagingRowForDisplay;

function packArray(p: PPack | PPack[] | null | undefined): PPack[] {
  if (!p) return [];
  return Array.isArray(p) ? p : [p];
}

/** Libellé court du conditionnement (nom produit ou référentiel). */
export function packagingConditionnementLabel(pack: PackagingRowForDisplay): string {
  const custom = typeof pack.nom === "string" ? pack.nom.trim() : "";
  if (custom.length > 0) {
    return custom;
  }
  const ref = labelFromRef(pack.ref_conditionnement);
  return ref !== "—" ? ref : "Colis";
}

/** Libellé arabe court (nom produit ou référentiel). */
export function packagingConditionnementLabelAr(pack: PackagingRowForDisplay): string | null {
  const customAr = typeof pack.nom_ar === "string" ? pack.nom_ar.trim() : "";
  if (customAr.length > 0) {
    return customAr;
  }
  const refAr = refMini(pack.ref_conditionnement)?.label_ar?.trim();
  return refAr && refAr.length > 0 ? refAr : null;
}

/** Libellé conditionnement selon la locale UI (arabe si dispo). */
export function packagingConditionnementLabelForLocale(
  pack: PackagingRowForDisplay,
  locale: AppLocale,
): string {
  if (locale === "ar-MA") {
    const ar = packagingConditionnementLabelAr(pack);
    if (ar) return ar;
  }
  return packagingConditionnementLabel(pack);
}

/** Ex. « Carton (12 Kg) » — utilisé partout où le conditionnement apparaît. */
export function buildPackagingCondTitre(pack: PackagingRowForDisplay): string {
  const packQty =
    typeof pack.quantity === "string" ? parseFloat(pack.quantity) : Number(pack.quantity);
  const condN = packagingConditionnementLabel(pack);
  const packUs = labelFromRef(pack.ref_sales_unit);
  return `${condN} (${formatPackQty(packQty)} ${packUs})`;
}

/** Variante localisée de {@link buildPackagingCondTitre}. */
export function buildPackagingCondTitreForLocale(
  pack: PackagingRowForDisplay,
  locale: AppLocale,
): string {
  const packQty =
    typeof pack.quantity === "string" ? parseFloat(pack.quantity) : Number(pack.quantity);
  const condN = packagingConditionnementLabelForLocale(pack, locale);
  const packUs = labelFromRefForLocale(pack.ref_sales_unit, locale);
  return `${condN} (${formatPackQty(packQty)} ${packUs})`;
}

export type ProductDisplayInfo = {
  /** UdV du produit (ligne à l’unité). */
  uniteVente: string;
  /** UdV du conditionnement retenu (pour « Soit … » quand isCond). */
  condPackUniteVente: string | null;
  condTitre: string | null;
  packContentQty: number | null;
  isCond: boolean;
  packSalesUnitIsUnite: boolean;
};

/**
 * Infos d’affichage pour une ligne de lot agrégée.
 *
 * @param ligneProductPackagingId — FK `commande_fournisseur_lot_ligne.product_packaging_id` :
 *   valeur absente / `null` signifie achat à **l’unité de vente** (pas de ligne « Soit » colis) ;
 *   sinon quantités et « Soit » sont exprimées pour ce conditionnement précis.
 */
export function buildLotProductDisplayInfo(
  product:
    | {
        ref_sales_unit?: unknown;
        product_packaging?: PPack | PPack[] | null | unknown;
      }
    | null
    | undefined,
  ligneProductPackagingId: string | null,
): ProductDisplayInfo {
  const noCond = {
    uniteVente: "—" as string,
    condPackUniteVente: null as string | null,
    condTitre: null as string | null,
    packContentQty: null as number | null,
    isCond: false,
    packSalesUnitIsUnite: false,
  };
  if (!product) {
    return noCond;
  }
  const uniteVente = labelFromRef(product.ref_sales_unit);
  const packs = packArray(product.product_packaging as PPack | PPack[] | null | undefined);
  if (packs.length === 0) {
    return { ...noCond, uniteVente };
  }
  /** Quantités matrices « à l’unité » (référence vente), sans colis préféré. */
  if (ligneProductPackagingId == null || ligneProductPackagingId === "") {
    return { ...noCond, uniteVente };
  }
  const pr =
    packs.find((p) => p.id === ligneProductPackagingId) ?? packs[0] ?? null;
  if (!pr) {
    return { ...noCond, uniteVente };
  }
  const packQty = typeof pr.quantity === "string" ? parseFloat(pr.quantity) : Number(pr.quantity);
  const packSalesUnitIsUnite = isPackSalesUnitUnite(pr.ref_sales_unit);
  const condPackUniteVente = labelFromRef(pr.ref_sales_unit);
  const condTitre = buildPackagingCondTitre(pr);
  return {
    uniteVente,
    condPackUniteVente,
    condTitre,
    packContentQty: Number.isFinite(packQty) ? packQty : null,
    isCond: true,
    packSalesUnitIsUnite,
  };
}

/** Unité affichée dans « Soit … » (Kg, L, ou « unité(s) » si colis en pièces). */
export function soitLineDisplayUnit(display: ProductDisplayInfo, convertedQty: number): string {
  if (display.packSalesUnitIsUnite) {
    return formatSoitUniteLabel(convertedQty);
  }
  return display.condPackUniteVente ?? display.uniteVente;
}

export function buildSoitLine(
  display: ProductDisplayInfo,
  qteForSoit: number,
): string | null {
  const { isCond, packContentQty } = display;
  if (
    !isCond ||
    packContentQty == null ||
    !Number.isFinite(packContentQty) ||
    qteForSoit <= 0
  ) {
    return null;
  }
  const converted = qteForSoit * packContentQty;
  const udvSoit = soitLineDisplayUnit(display, converted);
  return `Soit ${formatPackQty(converted)} ${udvSoit}`;
}

/** Ligne « Soit … » localisée (préfixe via callback, ex. `tc("soitLine", { qty, unit })`). */
export function buildSoitLineForLocale(
  display: ProductDisplayInfo,
  qteForSoit: number,
  locale: AppLocale,
  pack: PackagingRowForDisplay | null | undefined,
  formatLine: (qty: string, unit: string) => string,
): string | null {
  const { isCond, packContentQty } = display;
  if (
    !isCond ||
    packContentQty == null ||
    !Number.isFinite(packContentQty) ||
    qteForSoit <= 0
  ) {
    return null;
  }
  const converted = qteForSoit * packContentQty;
  const unit =
    pack?.ref_sales_unit != null
      ? labelFromRefForLocale(pack.ref_sales_unit, locale)
      : soitLineDisplayUnit(display, converted);
  return formatLine(formatPackQty(converted), unit);
}

/** Titre conditionnement pour le récap (locale UI, repli sur `condTitre` pré-calculé). */
export function recapCondTitreForLocale(
  condTitre: string | null | undefined,
  pack: PackagingRowForDisplay | null | undefined,
  locale: AppLocale,
): string | null {
  if (pack) {
    return buildPackagingCondTitreForLocale(pack, locale);
  }
  const t = condTitre?.trim();
  return t && t.length > 0 ? t : null;
}
