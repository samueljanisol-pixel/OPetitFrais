import type { CatalogProduct } from "@opf/caisse-core";
import type { CaisseRuntimeConfig } from "../../electron/preload/index";
import {
  normalizeCatalogProducts,
  normalizeCategoryMeta,
  type CatalogCategoryMeta,
} from "../../shared/catalog-normalize";

export type { CatalogCategoryMeta };

export type CatalogFetchResult = {
  products: CatalogProduct[];
  categories: string[];
  categoryMeta: CatalogCategoryMeta[];
  source: "api" | "mock";
  error: string | null;
  fetchedAt: string | null;
};

type ApiCatalogResponse = {
  ok: boolean;
  products?: unknown;
  categories?: unknown;
  fetchedAt?: string;
  error?: string;
};

let cachedConfig: CaisseRuntimeConfig | null = null;

export function invalidateCaisseCatalogConfigCache(): void {
  cachedConfig = null;
}

export async function getCaisseConfig(): Promise<CaisseRuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  if (window.caisseApi?.getConfig) {
    cachedConfig = await window.caisseApi.getConfig();
    return cachedConfig;
  }

  cachedConfig = {
    backofficeUrl: (import.meta.env.VITE_OPF_BACKOFFICE_URL ?? "http://localhost:3000").replace(
      /\/$/,
      "",
    ),
    caisseToken: import.meta.env.VITE_OPF_CAISSE_TOKEN ?? "",
    scalePort: "",
    ticketPrinter: "",
    magasinCode: "00",
    caisseCode: "01",
    posteId: "",
  };
  return cachedConfig;
}

export async function isCatalogApiConfigured(): Promise<boolean> {
  const config = await getCaisseConfig();
  return config.caisseToken.trim().length > 0;
}

async function fetchCatalogPayloadFromApi(): Promise<{
  products: CatalogProduct[];
  categoryMeta: CatalogCategoryMeta[];
  error: string | null;
  fetchedAt: string | null;
}> {
  const config = await getCaisseConfig();

  if (!config.caisseToken.trim()) {
    return {
      products: [],
      categoryMeta: [],
      error: "Token caisse introuvable (caisse.config.json ou .env.local)",
      fetchedAt: null,
    };
  }

  try {
    const url = `${config.backofficeUrl}/api/caisse/catalog?token=${encodeURIComponent(config.caisseToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as ApiCatalogResponse;

    if (!res.ok || !json.ok || !json.products) {
      return {
        products: [],
        categoryMeta: [],
        error: json.error ?? `HTTP ${res.status}`,
        fetchedAt: null,
      };
    }

    const products = normalizeCatalogProducts(json.products);
    const categoryMeta = normalizeCategoryMeta(json.categories);

    if (products.length === 0) {
      return {
        products: [],
        categoryMeta: [],
        error: "Catalogue vide ou données invalides",
        fetchedAt: null,
      };
    }

    return {
      products,
      categoryMeta,
      error: null,
      fetchedAt: json.fetchedAt ?? new Date().toISOString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return {
      products: [],
      categoryMeta: [],
      error: msg,
      fetchedAt: null,
    };
  }
}

export async function fetchCatalogFromApi(): Promise<CatalogFetchResult> {
  if (window.caisseApi?.refreshCatalogCache) {
    const cached = await window.caisseApi.refreshCatalogCache();
    const products = normalizeCatalogProducts(cached.products);
    const categoryMeta = normalizeCategoryMeta(cached.categories);

    if (products.length > 0) {
      const categories = categoryMeta
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"))
        .map((c) => c.label);

      return {
        products,
        categories,
        categoryMeta,
        source: "api",
        error: null,
        fetchedAt: new Date().toISOString(),
      };
    }

    if (cached.error) {
      return {
        products: [],
        categories: [],
        categoryMeta: [],
        source: "mock",
        error: cached.error,
        fetchedAt: null,
      };
    }
  }

  const payload = await fetchCatalogPayloadFromApi();
  const categories = payload.categoryMeta
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"))
    .map((c) => c.label);

  return {
    products: payload.products,
    categories,
    categoryMeta: payload.categoryMeta,
    source: payload.products.length > 0 ? "api" : "mock",
    error: payload.error,
    fetchedAt: payload.fetchedAt,
  };
}
