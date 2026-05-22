import type { PackRoute } from "@/features/commandes-fournisseur/parcours-product-quantity";
import {
  packArray,
  preferredPackRoute,
  pKeyForProduct,
  uKeyForProduct,
  type ParcoursProductForQty,
} from "@/features/commandes-fournisseur/parcours-product-quantity";

type LigneIn = { product_id: string; product_packaging_id: string | null; qte: number };

export function buildParcoursQtesFromLignes(
  list: ParcoursProductForQty[],
  lignes: LigneIn[],
  supplierId: string | null,
): { qtes: Record<string, number>; packRoute: Record<string, PackRoute> } {
  const byProduct = new Map<string, LigneIn[]>();
  for (const l of lignes) {
    const arr = byProduct.get(l.product_id) ?? [];
    arr.push(l);
    byProduct.set(l.product_id, arr);
  }

  const packRoute: Record<string, PackRoute> = {};
  const qtes: Record<string, number> = {};
  const uKey = uKeyForProduct;
  const pKey = pKeyForProduct;

  for (const p of list) {
    const packs = packArray(p.product_packaging);
    const packIds = new Set(packs.map((x) => x.id));
    const listL = byProduct.get(p.id) ?? [];
    let routeSet = false;
    for (const l of listL) {
      if (l.qte <= 0) continue;
      if (l.product_packaging_id && packIds.has(l.product_packaging_id)) {
        qtes[pKey(p.id, l.product_packaging_id)] = l.qte;
        if (!routeSet) {
          packRoute[p.id] = l.product_packaging_id;
          routeSet = true;
        }
      } else if (!l.product_packaging_id) {
        qtes[uKey(p.id)] = l.qte;
        if (!routeSet) {
          packRoute[p.id] = "unit";
          routeSet = true;
        }
      } else if (!routeSet) {
        packRoute[p.id] = preferredPackRoute(packs, supplierId);
      }
    }
    if (!routeSet) {
      packRoute[p.id] = preferredPackRoute(packs, supplierId);
    }
  }

  return { qtes, packRoute };
}

export function findParcoursProductIndex(
  products: { id: string }[],
  productId: string | null | undefined,
): number {
  if (!productId) {
    return -1;
  }
  return products.findIndex((p) => p.id === productId);
}
