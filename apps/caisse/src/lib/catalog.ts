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
  source: "api" | "cache" | "mock";
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

type BrowserCatalogCache = {
  products: CatalogProduct[];
  categoryMeta: CatalogCategoryMeta[];
  fetchedAt: string;
};

const BROWSER_CATALOG_CACHE_KEY = "opf-caisse-catalog-cache";

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

function categoryLabelsFromMeta(categoryMeta: CatalogCategoryMeta[]): string[] {
  return categoryMeta
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"))
    .map((c) => c.label);
}

function catalogResultFromPayload(
  products: CatalogProduct[],
  categoryMeta: CatalogCategoryMeta[],
  source: CatalogFetchResult["source"],
  error: string | null,
  fetchedAt: string | null,
): CatalogFetchResult {
  return {
    products,
    categories: categoryLabelsFromMeta(categoryMeta),
    categoryMeta,
    source,
    error,
    fetchedAt,
  };
}

function loadBrowserCatalogCache(): CatalogFetchResult | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(BROWSER_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserCatalogCache;
    const products = normalizeCatalogProducts(parsed.products);
    const categoryMeta = normalizeCategoryMeta(parsed.categoryMeta);
    if (products.length === 0) return null;
    return catalogResultFromPayload(
      products,
      categoryMeta,
      "cache",
      null,
      parsed.fetchedAt ?? null,
    );
  } catch {
    return null;
  }
}

function saveBrowserCatalogCache(
  products: CatalogProduct[],
  categoryMeta: CatalogCategoryMeta[],
  fetchedAt: string,
): void {
  if (typeof localStorage === "undefined") return;

  try {
    const payload: BrowserCatalogCache = { products, categoryMeta, fetchedAt };
    localStorage.setItem(BROWSER_CATALOG_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

function resultFromInitialCatalogPayload(
  payload: {
    products: unknown;
    categories: unknown;
    error: string | null;
    source?: "network" | "cache" | "none";
    fetchedAt?: string | null;
  },
): CatalogFetchResult {
  const products = normalizeCatalogProducts(payload.products);
  const categoryMeta = normalizeCategoryMeta(payload.categories);
  let source: CatalogFetchResult["source"] = "mock";
  if (products.length > 0) {
    source = payload.source === "cache" ? "cache" : "api";
  }

  return catalogResultFromPayload(products, categoryMeta, source, payload.error, payload.fetchedAt ?? null);
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

/** Charge le catalogue depuis le cache local (Electron ou localStorage), sans appel réseau. */
export async function fetchCatalogFromCache(): Promise<CatalogFetchResult> {
  if (window.caisseApi?.getInitialCatalog) {
    const cached = await window.caisseApi.getInitialCatalog();
    if (cached && cached.products.length > 0) {
      return resultFromInitialCatalogPayload(cached);
    }
  }

  const browserCache = loadBrowserCatalogCache();
  if (browserCache) return browserCache;

  const payload = await fetchCatalogPayloadFromApi();
  if (payload.products.length > 0) {
    saveBrowserCatalogCache(payload.products, payload.categoryMeta, payload.fetchedAt ?? new Date().toISOString());
    return catalogResultFromPayload(
      payload.products,
      payload.categoryMeta,
      "api",
      null,
      payload.fetchedAt,
    );
  }

  return catalogResultFromPayload(
    payload.products,
    payload.categoryMeta,
    "mock",
    payload.error,
    payload.fetchedAt,
  );
}

/** Force une actualisation réseau (Menu → Actualiser les prix). Fallback cache si hors ligne. */
export async function refreshCatalogFromApi(): Promise<CatalogFetchResult> {
  if (window.caisseApi?.refreshCatalogCache) {
    const cached = await window.caisseApi.refreshCatalogCache();
    const result = resultFromInitialCatalogPayload(cached);
    if (result.products.length > 0) return result;
    if (result.error) return result;
  }

  const payload = await fetchCatalogPayloadFromApi();
  if (payload.products.length > 0) {
    saveBrowserCatalogCache(payload.products, payload.categoryMeta, payload.fetchedAt ?? new Date().toISOString());
    return catalogResultFromPayload(
      payload.products,
      payload.categoryMeta,
      "api",
      null,
      payload.fetchedAt,
    );
  }

  const browserCache = loadBrowserCatalogCache();
  if (browserCache) {
    return {
      ...browserCache,
      error: payload.error ?? browserCache.error,
    };
  }

  return catalogResultFromPayload(
    payload.products,
    payload.categoryMeta,
    "mock",
    payload.error,
    payload.fetchedAt,
  );
}

/** @deprecated Préférer fetchCatalogFromCache ou refreshCatalogFromApi */
export async function fetchCatalogFromApi(): Promise<CatalogFetchResult> {
  return refreshCatalogFromApi();
}

export function formatCatalogCacheDate(iso: string | null): string {
  if (!iso) return "date inconnue";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
