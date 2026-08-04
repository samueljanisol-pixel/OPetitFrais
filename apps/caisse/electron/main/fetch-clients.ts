import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { CaisseClient } from "@opf/caisse-core";
import { loadRuntimeConfig } from "./load-config";

export type ClientsCacheSource = "network" | "cache" | "none";

export type InitialClientsPayload = {
  clients: CaisseClient[];
  error: string | null;
  source: ClientsCacheSource;
  fetchedAt: string | null;
};

type DiskClientsCache = {
  clients: CaisseClient[];
  fetchedAt: string;
  savedAt: string;
};

let cachedClients: InitialClientsPayload | null = null;

type ApiClientsResponse = {
  ok: boolean;
  clients?: CaisseClient[];
  fetchedAt?: string;
  error?: string;
};

function clientsCachePath(): string {
  return join(app.getPath("userData"), "clients-cache.json");
}

function loadDiskClients(): DiskClientsCache | null {
  try {
    const path = clientsCachePath();
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as DiskClientsCache;
    if (!Array.isArray(parsed.clients)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDiskClients(clients: CaisseClient[], fetchedAt: string): void {
  try {
    const payload: DiskClientsCache = {
      clients,
      fetchedAt,
      savedAt: new Date().toISOString(),
    };
    writeFileSync(clientsCachePath(), JSON.stringify(payload), "utf8");
  } catch {
    // ignore write errors
  }
}

function payloadFromDisk(disk: DiskClientsCache): InitialClientsPayload {
  return {
    clients: disk.clients,
    error: null,
    source: "cache",
    fetchedAt: disk.fetchedAt,
  };
}

function fallbackToDiskCache(networkError: string | null): InitialClientsPayload {
  const disk = loadDiskClients();
  if (disk && disk.clients.length > 0) {
    cachedClients = payloadFromDisk(disk);
    return cachedClients;
  }

  cachedClients = {
    clients: [],
    error: networkError ?? "Liste clients indisponible",
    source: "none",
    fetchedAt: null,
  };
  return cachedClients;
}

export async function prefetchClients(force = false): Promise<InitialClientsPayload> {
  if (!force && cachedClients && cachedClients.clients.length > 0) {
    return cachedClients;
  }

  const config = loadRuntimeConfig();
  if (!config.caisseToken.trim()) {
    return fallbackToDiskCache("Token caisse introuvable (caisse.config.json ou .env.local)");
  }

  try {
    const url = `${config.backofficeUrl}/api/caisse/clients?token=${encodeURIComponent(config.caisseToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as ApiClientsResponse;

    if (!res.ok || !json.ok || !json.clients) {
      return fallbackToDiskCache(json.error ?? `HTTP ${res.status}`);
    }

    const fetchedAt = json.fetchedAt ?? new Date().toISOString();
    saveDiskClients(json.clients, fetchedAt);

    cachedClients = {
      clients: json.clients,
      error: null,
      source: "network",
      fetchedAt,
    };
    return cachedClients;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return fallbackToDiskCache(msg);
  }
}

export function getCachedClients(): InitialClientsPayload | null {
  if (cachedClients && cachedClients.clients.length > 0) {
    return cachedClients;
  }

  const disk = loadDiskClients();
  if (disk && disk.clients.length > 0) {
    cachedClients = payloadFromDisk(disk);
    return cachedClients;
  }

  return cachedClients;
}

export function clearCachedClients(): void {
  cachedClients = null;
}
