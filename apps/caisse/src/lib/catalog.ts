import type { CatalogProduct } from "@opf/caisse-core";
import type { CaisseRuntimeConfig } from "../../electron/preload/index";
import { normalizeCatalogProducts } from "../data/catalog-helpers";

export type CatalogFetchResult = {
  products: CatalogProduct[];
  categories: string[];
  source: "api" | "mock";
  error: string | null;
  fetchedAt: string | null;
};

type ApiCatalogResponse = {
  ok: boolean;
  products?: CatalogProduct[];
  categories?: Array<{ id: string; label: string; sortOrder: number }>;
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

export async function fetchCatalogFromApi(): Promise<CatalogFetchResult> {
  const config = await getCaisseConfig();

  if (!config.caisseToken.trim()) {
    return {
      products: [],
      categories: [],
      source: "mock",
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
        categories: [],
        source: "mock",
        error: json.error ?? `HTTP ${res.status}`,
        fetchedAt: null,
      };
    }

    const products = normalizeCatalogProducts(json.products);

    if (products.length === 0) {
      return {
        products: [],
        categories: [],
        source: "mock",
        error: "Catalogue vide ou données invalides",
        fetchedAt: null,
      };
    }

    const categories = (json.categories ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"))
      .map((c) => c.label);

    return {
      products,
      categories,
      source: "api",
      error: null,
      fetchedAt: json.fetchedAt ?? new Date().toISOString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return {
      products: [],
      categories: [],
      source: "mock",
      error: msg,
      fetchedAt: null,
    };
  }
}
