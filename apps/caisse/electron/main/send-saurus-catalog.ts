import { catalogToSaurusPluItems } from "./catalog-to-saurus-plu";
import { getCachedCatalog, prefetchCatalog } from "./fetch-catalog";
import { loadRuntimeConfig } from "./load-config";
import { isValidSaurusScaleIp, normalizeSaurusScaleIp } from "./saurus-scale/setting";
import { uploadSaurusCatalog } from "./saurus-scale/upload-catalog";

export type SendSaurusCatalogResult =
  | {
      ok: true;
      productCount: number;
      pluPacketCount: number;
      skipped: Array<{ code: string; reason: string }>;
    }
  | {
      ok: false;
      error: string;
      skipped?: Array<{ code: string; reason: string }>;
    };

export async function sendSaurusCatalogFromCache(): Promise<SendSaurusCatalogResult> {
  const config = loadRuntimeConfig();
  const ip = normalizeSaurusScaleIp(config.saurusScaleIp);
  if (!ip) {
    return {
      ok: false,
      error: "Adresse IP balance SAURUS non configurée (Paramètres)",
    };
  }
  if (!isValidSaurusScaleIp(ip)) {
    return { ok: false, error: "Adresse IP balance SAURUS invalide" };
  }

  let catalog = getCachedCatalog();
  if (!catalog || catalog.products.length === 0) {
    catalog = await prefetchCatalog();
  }
  if (catalog.error) {
    return { ok: false, error: catalog.error };
  }

  const { items, skipped } = catalogToSaurusPluItems(catalog.products);
  if (items.length === 0) {
    return {
      ok: false,
      error: "Aucun produit éligible pour la balance",
      skipped,
    };
  }

  const upload = await uploadSaurusCatalog(ip, items);
  if (!upload.ok) {
    return { ok: false, error: upload.error, skipped };
  }

  return {
    ok: true,
    productCount: upload.productCount,
    pluPacketCount: upload.pluPacketCount,
    skipped,
  };
}
