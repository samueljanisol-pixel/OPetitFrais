import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { CatalogProduct } from "@opf/caisse-core";
import { applyLocalPhotoUrls, cacheCatalogPhotos } from "./catalog-photos";
import { loadRuntimeConfig } from "./load-config";
import {
  normalizeCatalogProducts,
  normalizeCategoryMeta,
  type CatalogCategoryMeta,
} from "../../shared/catalog-normalize";

export type CatalogCacheSource = "network" | "cache" | "none";

export type InitialCatalogPayload = {
  products: CatalogProduct[];
  categories: CatalogCategoryMeta[];
  error: string | null;
  source: CatalogCacheSource;
  fetchedAt: string | null;
};

type DiskCatalogCache = {
  products: CatalogProduct[];
  categories: CatalogCategoryMeta[];
  fetchedAt: string;
  savedAt: string;
};

let cachedCatalog: InitialCatalogPayload | null = null;

type ApiCatalogResponse = {
  ok: boolean;
  products?: unknown;
  categories?: unknown;
  fetchedAt?: string;
  error?: string;
};

function catalogCachePath(): string {
  return join(app.getPath("userData"), "catalog-cache.json");
}

function loadDiskCatalog(): DiskCatalogCache | null {
  try {
    const path = catalogCachePath();
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as DiskCatalogCache;
    if (!Array.isArray(parsed.products) || parsed.products.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDiskCatalog(
  products: CatalogProduct[],
  categories: CatalogCategoryMeta[],
  fetchedAt: string,
): void {
  try {
    const payload: DiskCatalogCache = {
      products,
      categories,
      fetchedAt,
      savedAt: new Date().toISOString(),
    };
    writeFileSync(catalogCachePath(), JSON.stringify(payload), "utf8");
  } catch {
    // ignore write errors (permissions, disk full)
  }
}

function payloadFromDisk(disk: DiskCatalogCache): InitialCatalogPayload {
  const products = applyLocalPhotoUrls(normalizeCatalogProducts(disk.products));
  const categories = normalizeCategoryMeta(disk.categories);
  return {
    products,
    categories,
    error: null,
    source: "cache",
    fetchedAt: disk.fetchedAt,
  };
}

function withLocalPhotos(payload: InitialCatalogPayload): InitialCatalogPayload {
  return {
    ...payload,
    products: applyLocalPhotoUrls(payload.products),
  };
}

function fallbackToDiskCache(networkError: string | null): InitialCatalogPayload {
  const disk = loadDiskCatalog();
  if (disk) {
    cachedCatalog = payloadFromDisk(disk);
    return cachedCatalog;
  }

  cachedCatalog = {
    products: [],
    categories: [],
    error: networkError ?? "Catalogue indisponible",
    source: "none",
    fetchedAt: null,
  };
  return cachedCatalog;
}

export async function prefetchCatalog(force = false): Promise<InitialCatalogPayload> {
  if (!force && cachedCatalog && cachedCatalog.products.length > 0) {
    return cachedCatalog;
  }

  const config = loadRuntimeConfig();
  if (!config.caisseToken.trim()) {
    return fallbackToDiskCache("Token caisse introuvable (caisse.config.json ou .env.local)");
  }

  try {
    const url = `${config.backofficeUrl}/api/caisse/catalog?token=${encodeURIComponent(config.caisseToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as ApiCatalogResponse;

    if (!res.ok || !json.ok || !json.products) {
      return fallbackToDiskCache(json.error ?? `HTTP ${res.status}`);
    }

    const products = normalizeCatalogProducts(json.products);
    const categories = normalizeCategoryMeta(json.categories);

    if (products.length === 0) {
      return fallbackToDiskCache(json.error ?? "Catalogue vide ou données invalides");
    }

    const fetchedAt = json.fetchedAt ?? new Date().toISOString();
    // Garde les URL distantes sur disque ; les fichiers locaux sont à côté.
    saveDiskCatalog(products, categories, fetchedAt);
    await cacheCatalogPhotos(products);

    cachedCatalog = {
      products: applyLocalPhotoUrls(products),
      categories,
      error: null,
      source: "network",
      fetchedAt,
    };
    return cachedCatalog;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return fallbackToDiskCache(msg);
  }
}

export function getCachedCatalog(): InitialCatalogPayload | null {
  if (cachedCatalog && cachedCatalog.products.length > 0) {
    return withLocalPhotos(cachedCatalog);
  }

  const disk = loadDiskCatalog();
  if (disk) {
    cachedCatalog = payloadFromDisk(disk);
    // Complète les photos manquantes en fond si un jour le réseau revient.
    void cacheCatalogPhotos(normalizeCatalogProducts(disk.products)).then(() => {
      if (cachedCatalog) {
        cachedCatalog = withLocalPhotos({
          ...cachedCatalog,
          products: normalizeCatalogProducts(disk.products),
        });
      }
    });
    return cachedCatalog;
  }

  return cachedCatalog;
}

export function clearCachedCatalog(): void {
  cachedCatalog = null;
}
