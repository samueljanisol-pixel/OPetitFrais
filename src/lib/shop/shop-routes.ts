import { isShopLocalPreviewPath } from "@/lib/shop/hosts";

export type ShopRoutes = {
  home: string;
  livraison: string;
  fulfillmentAnchor: string;
};

/** Liens internes boutique selon `/` (domaine shop) ou `/shop` (aperçu local dev). */
export function shopRoutesFromPathname(pathname: string | null): ShopRoutes {
  const preview = pathname != null && isShopLocalPreviewPath(pathname);
  return {
    home: preview ? "/shop" : "/",
    livraison: preview ? "/shop/livraison" : "/livraison",
    fulfillmentAnchor: preview ? "/shop#fulfillment" : "/#fulfillment",
  };
}
