import type { CaisseClient } from "@opf/caisse-core";
import { getCaisseConfig } from "./catalog";
import { loadClientsCache, saveClientsCache } from "./clients-cache";

export type ClientsFetchResult = {
  clients: CaisseClient[];
  source: "api" | "cache" | "empty";
  error: string | null;
  fetchedAt: string | null;
};

type ApiClientsResponse = {
  ok: boolean;
  clients?: CaisseClient[];
  client?: CaisseClient;
  fetchedAt?: string;
  error?: string;
};

async function caisseApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = await getCaisseConfig();
  const token = encodeURIComponent(config.caisseToken);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${config.backofficeUrl}${path}${sep}token=${token}`;
  return fetch(url, init);
}

export async function isClientsApiConfigured(): Promise<boolean> {
  const config = await getCaisseConfig();
  return config.caisseToken.trim().length > 0;
}

function resultFromCachedClients(
  clients: CaisseClient[],
  fetchedAt: string | null,
  error: string | null = null,
): ClientsFetchResult {
  if (clients.length > 0) {
    saveClientsCache(clients, fetchedAt ?? new Date().toISOString());
    return {
      clients,
      source: "cache",
      error,
      fetchedAt,
    };
  }
  return {
    clients: [],
    source: "empty",
    error: error ?? "Liste clients indisponible",
    fetchedAt: null,
  };
}

function loadRendererClientsCache(): ClientsFetchResult | null {
  const cached = loadClientsCache();
  if (!cached || cached.clients.length === 0) return null;
  return resultFromCachedClients(cached.clients, cached.fetchedAt);
}

/** Charge la liste clients depuis le cache (Electron disque ou localStorage), sans réseau. */
export async function fetchClientsFromCache(): Promise<ClientsFetchResult> {
  if (window.caisseApi?.getInitialClients) {
    const cached = await window.caisseApi.getInitialClients();
    if (cached && cached.clients.length > 0) {
      return resultFromCachedClients(cached.clients, cached.fetchedAt ?? null);
    }
  }

  const browserCache = loadRendererClientsCache();
  if (browserCache) return browserCache;

  return fetchClientsFromApi();
}

/** Force une actualisation réseau. Fallback cache si hors ligne. */
export async function refreshClientsFromApi(): Promise<ClientsFetchResult> {
  if (window.caisseApi?.refreshClientsCache) {
    const cached = await window.caisseApi.refreshClientsCache();
    if (cached.clients.length > 0) {
      return resultFromCachedClients(cached.clients, cached.fetchedAt ?? null);
    }
    if (cached.error) {
      const fallback = loadRendererClientsCache();
      if (fallback) return { ...fallback, error: cached.error };
    }
  }

  return fetchClientsFromApi();
}

export async function fetchClientsFromApi(): Promise<ClientsFetchResult> {
  const configured = await isClientsApiConfigured();
  if (!configured) {
    const fallback = loadRendererClientsCache();
    if (fallback) return fallback;
    return {
      clients: [],
      source: "empty",
      error: "Token caisse introuvable (caisse.config.json ou .env.local)",
      fetchedAt: null,
    };
  }

  try {
    const res = await caisseApiFetch("/api/caisse/clients");
    const json = (await res.json()) as ApiClientsResponse;

    if (!res.ok || !json.ok || !json.clients) {
      const fallback = loadRendererClientsCache();
      if (fallback) {
        return {
          ...fallback,
          error: json.error ?? `HTTP ${res.status}`,
        };
      }
      return {
        clients: [],
        source: "empty",
        error: json.error ?? `HTTP ${res.status}`,
        fetchedAt: null,
      };
    }

    const fetchedAt = json.fetchedAt ?? new Date().toISOString();
    saveClientsCache(json.clients, fetchedAt);

    return {
      clients: json.clients,
      source: "api",
      error: null,
      fetchedAt,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    const fallback = loadRendererClientsCache();
    if (fallback) {
      return { ...fallback, error: msg };
    }
    return { clients: [], source: "empty", error: msg, fetchedAt: null };
  }
}

export async function createClientOnApi(input: {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}): Promise<{ client: CaisseClient | null; error: string | null }> {
  try {
    const res = await caisseApiFetch("/api/caisse/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        notes: input.notes || null,
      }),
    });
    const json = (await res.json()) as ApiClientsResponse;

    if (!res.ok || !json.ok || !json.client) {
      return { client: null, error: json.error ?? `HTTP ${res.status}` };
    }

    return { client: json.client, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return { client: null, error: msg };
  }
}

export async function updateClientOnApi(
  id: string,
  input: {
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  },
): Promise<{ client: CaisseClient | null; error: string | null }> {
  try {
    const res = await caisseApiFetch(`/api/caisse/clients/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        notes: input.notes || null,
      }),
    });
    const json = (await res.json()) as ApiClientsResponse;

    if (!res.ok || !json.ok || !json.client) {
      return { client: null, error: json.error ?? `HTTP ${res.status}` };
    }

    return { client: json.client, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return { client: null, error: msg };
  }
}
