/** Affichage unité / conditionnement / « Soit » — aligné sur la logique de l’API commandes (récap). */

type RefMini = { label?: string | null; code?: string | null };

function refMini(raw: unknown): RefMini | null {
  const o = (Array.isArray(raw) ? raw[0] : raw) as RefMini | null | undefined;
  return o ?? null;
}

export function labelFromRef(raw: unknown): string {
  const t = refMini(raw)?.label?.trim();
  return t ? String(t) : "—";
}

/** UdV conditionnement « Unité » : pas de ligne « Soit … » (déjà compté à l’unité). */
export function isPackSalesUnitUnite(raw: unknown): boolean {
  const o = refMini(raw);
  if (!o) return false;
  const label = (o.label ?? "").trim().toLowerCase();
  const code = (o.code ?? "").trim().toLowerCase();
  return label === "unité" || label === "unite" || code === "unite";
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
  const condN = labelFromRef(pr.ref_conditionnement);
  const packUs = labelFromRef(pr.ref_sales_unit);
  const packSalesUnitIsUnite = isPackSalesUnitUnite(pr.ref_sales_unit);
  const condTitre = `${condN !== "—" ? condN : "Colis"} (${formatPackQty(packQty)} ${packUs})`;
  return {
    uniteVente,
    condTitre,
    packContentQty: Number.isFinite(packQty) ? packQty : null,
    isCond: true,
    packSalesUnitIsUnite,
  };
}

export function buildSoitLine(
  display: ProductDisplayInfo,
  qteForSoit: number,
): string | null {
  const { isCond, packContentQty, uniteVente, packSalesUnitIsUnite } = display;
  if (
    !isCond ||
    packSalesUnitIsUnite ||
    packContentQty == null ||
    !Number.isFinite(packContentQty) ||
    qteForSoit <= 0
  ) {
    return null;
  }
  return `Soit ${formatPackQty(qteForSoit * packContentQty)} ${uniteVente}`;
}
