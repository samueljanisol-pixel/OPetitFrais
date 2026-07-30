import type { CatalogProduct } from "@opf/caisse-core";
import { loadRuntimeConfig } from "./load-config";

export type InitialCatalogPayload = {
  products: CatalogProduct[];
  error: string | null;
};

let cachedCatalog: InitialCatalogPayload | null = null;

type ApiCatalogResponse = {
  ok: boolean;
  products?: CatalogProduct[];
  error?: string;
};

export async function prefetchCatalog(): Promise<InitialCatalogPayload> {
  if (cachedCatalog) return cachedCatalog;

  const config = loadRuntimeConfig();
  if (!config.caisseToken.trim()) {
    cachedCatalog = {
      products: [],
      error: "Token caisse introuvable (caisse.config.json ou .env.local)",
    };
    return cachedCatalog;
  }

  try {
    const url = `${config.backofficeUrl}/api/caisse/catalog?token=${encodeURIComponent(config.caisseToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as ApiCatalogResponse;

    if (!res.ok || !json.ok || !json.products || json.products.length === 0) {
      cachedCatalog = {
        products: [],
        error: json.error ?? `HTTP ${res.status}`,
      };
      return cachedCatalog;
    }

    cachedCatalog = { products: json.products, error: null };
    return cachedCatalog;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    cachedCatalog = { products: [], error: msg };
    return cachedCatalog;
  }
}

export function getCachedCatalog(): InitialCatalogPayload | null {
  return cachedCatalog;
}

export function clearCachedCatalog(): void {
  cachedCatalog = null;
}
