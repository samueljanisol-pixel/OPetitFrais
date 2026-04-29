/** Affichage unité / conditionnement / « Soit » — aligné sur la logique de l’API commandes (récap). */

export function labelFromRef(raw: unknown): string {
  const o = (Array.isArray(raw) ? raw[0] : raw) as { label?: string } | null | undefined;
  const t = o?.label?.trim();
  return t ? String(t) : "—";
}

export function formatPackQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

type PPack = {
  id: string;
  quantity: string | number;
  ref_conditionnement?: unknown;
  ref_sales_unit?: unknown;
};

function packArray(p: PPack | PPack[] | null | undefined): PPack[] {
  if (!p) return [];
  return Array.isArray(p) ? p : [p];
}

export type ProductDisplayInfo = {
  uniteVente: string;
  condTitre: string | null;
  packContentQty: number | null;
  isCond: boolean;
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
  if (!product) {
    return { uniteVente: "—", condTitre: null, packContentQty: null, isCond: false };
  }
  const uniteVente = labelFromRef(product.ref_sales_unit);
  const packs = packArray(product.product_packaging as PPack | PPack[] | null | undefined);
  if (packs.length === 0) {
    return { uniteVente, condTitre: null, packContentQty: null, isCond: false };
  }
  /** Quantités matrices « à l’unité » (référence vente), sans colis préféré. */
  if (ligneProductPackagingId == null || ligneProductPackagingId === "") {
    return { uniteVente, condTitre: null, packContentQty: null, isCond: false };
  }
  const pr =
    packs.find((p) => p.id === ligneProductPackagingId) ?? packs[0] ?? null;
  if (!pr) {
    return { uniteVente, condTitre: null, packContentQty: null, isCond: false };
  }
  const packQty = typeof pr.quantity === "string" ? parseFloat(pr.quantity) : Number(pr.quantity);
  const condN = labelFromRef(pr.ref_conditionnement);
  const packUs = labelFromRef(pr.ref_sales_unit);
  const condTitre = `${condN !== "—" ? condN : "Colis"} (${formatPackQty(packQty)} ${packUs})`;
  return {
    uniteVente,
    condTitre,
    packContentQty: Number.isFinite(packQty) ? packQty : null,
    isCond: true,
  };
}

export function buildSoitLine(
  display: ProductDisplayInfo,
  qteForSoit: number,
): string | null {
  const { isCond, packContentQty, uniteVente } = display;
  if (!isCond || packContentQty == null || !Number.isFinite(packContentQty) || qteForSoit <= 0) {
    return null;
  }
  return `Soit ${formatPackQty(qteForSoit * packContentQty)} ${uniteVente}`;
}
