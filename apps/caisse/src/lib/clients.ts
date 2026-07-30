import type { CaisseClient } from "@opf/caisse-core";
import { getCaisseConfig } from "./catalog";

export type ClientsFetchResult = {
  clients: CaisseClient[];
  source: "api" | "empty";
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

export async function fetchClientsFromApi(): Promise<ClientsFetchResult> {
  const configured = await isClientsApiConfigured();
  if (!configured) {
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
      return {
        clients: [],
        source: "empty",
        error: json.error ?? `HTTP ${res.status}`,
        fetchedAt: null,
      };
    }

    return {
      clients: json.clients,
      source: "api",
      error: null,
      fetchedAt: json.fetchedAt ?? new Date().toISOString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
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
