/** Calculs prix d’achat lot (qtyBase PU↔montant). */

import type { ProductDisplayInfo } from "@/lib/commandes-fournisseur/product-display";

/** Quantité de base (= quantité × contenu colis ; unité affichée dans « Soit » = UdV conditionnement). */
export function qtyBaseFromLotLine(qteAchat: number, display: ProductDisplayInfo): number {
  if (!Number.isFinite(qteAchat) || qteAchat < 0) return 0;
  const { isCond, packContentQty } = display;
  if (isCond && packContentQty != null && Number.isFinite(packContentQty)) {
    return qteAchat * packContentQty;
  }
  return qteAchat;
}

/** Montant ligne depuis PU et qtyBase ; `null` si PU absent ou illisible. */
export function montantLigneFromPu(pu: number | null, qtyBase: number): number | null {
  if (pu == null || !Number.isFinite(pu)) return null;
  if (qtyBase <= 0) return 0;
  return Math.round(pu * qtyBase * 100) / 100;
}

/** Dérive PU depuis montant et qtyBase. */
export function puFromMontantLigne(montant: number, qtyBase: number): number | null {
  if (qtyBase <= 0 || !Number.isFinite(montant)) return null;
  return Math.round((montant / qtyBase) * 10000) / 10000;
}
