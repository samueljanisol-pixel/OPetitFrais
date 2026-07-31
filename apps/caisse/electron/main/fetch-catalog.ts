import type { CatalogProduct } from "@opf/caisse-core";
import { loadRuntimeConfig } from "./load-config";
import {
  normalizeCatalogProducts,
  normalizeCategoryMeta,
  type CatalogCategoryMeta,
} from "../../shared/catalog-normalize";

export type InitialCatalogPayload = {
  products: CatalogProduct[];
  categories: CatalogCategoryMeta[];
  error: string | null;
};

let cachedCatalog: InitialCatalogPayload | null = null;

type ApiCatalogResponse = {
  ok: boolean;
  products?: unknown;
  categories?: unknown;
  error?: string;
};

export async function prefetchCatalog(force = false): Promise<InitialCatalogPayload> {
  if (!force && cachedCatalog) return cachedCatalog;

  const config = loadRuntimeConfig();
  if (!config.caisseToken.trim()) {
    cachedCatalog = {
      products: [],
      categories: [],
      error: "Token caisse introuvable (caisse.config.json ou .env.local)",
    };
    return cachedCatalog;
  }

  try {
    const url = `${config.backofficeUrl}/api/caisse/catalog?token=${encodeURIComponent(config.caisseToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as ApiCatalogResponse;

    if (!res.ok || !json.ok || !json.products) {
      cachedCatalog = {
        products: [],
        categories: [],
        error: json.error ?? `HTTP ${res.status}`,
      };
      return cachedCatalog;
    }

    const products = normalizeCatalogProducts(json.products);
    const categories = normalizeCategoryMeta(json.categories);

    if (products.length === 0) {
      cachedCatalog = {
        products: [],
        categories: [],
        error: json.error ?? "Catalogue vide ou données invalides",
      };
      return cachedCatalog;
    }

    cachedCatalog = { products, categories, error: null };
    return cachedCatalog;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    cachedCatalog = { products: [], categories: [], error: msg };
    return cachedCatalog;
  }
}

export function getCachedCatalog(): InitialCatalogPayload | null {
  return cachedCatalog;
}

export function clearCachedCatalog(): void {
  cachedCatalog = null;
}
