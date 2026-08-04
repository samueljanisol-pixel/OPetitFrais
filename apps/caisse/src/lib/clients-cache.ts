import type { CaisseClient } from "@opf/caisse-core";

const CLIENTS_CACHE_KEY = "opf-caisse-clients-cache";

type ClientsDiskCache = {
  clients: CaisseClient[];
  fetchedAt: string;
};

export function loadClientsCache(): ClientsDiskCache | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(CLIENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientsDiskCache;
    if (!Array.isArray(parsed.clients)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveClientsCache(clients: CaisseClient[], fetchedAt: string): void {
  if (typeof localStorage === "undefined") return;

  try {
    const payload: ClientsDiskCache = { clients, fetchedAt };
    localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearClientsCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CLIENTS_CACHE_KEY);
  } catch {
    // ignore
  }
}
