import { getCaisseConfig } from "./catalog";

export type CommandeBoutiqueItem = {
  cartId: string;
  cartNumber: number;
  clientId: string | null;
  clientName: string | null;
  fulfillmentMode: string | null;
  montantEstime: number | null;
  caisseLockState: "available" | "locked_self" | "locked_other";
  caisseLockLabel: string | null;
};

export type CommandeEncaissementItem = {
  cartId: string;
  cartNumber: number;
  clientId: string | null;
  clientName: string | null;
  montant: number;
  workflowStatus: string | null;
  encaissementLabel: string;
};

async function caisseApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = await getCaisseConfig();
  const token = encodeURIComponent(config.caisseToken);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${config.backofficeUrl}${path}${sep}token=${token}`;
  return fetch(url, init);
}

async function readCaisseApiJson<T extends { error?: string }>(
  res: Response,
): Promise<{ json: T | null; error: string | null }> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 404) {
      return {
        json: null,
        error:
          "API commandes boutique introuvable (404). Mettez à jour le backoffice ou vérifiez l’URL.",
      };
    }
    return { json: null, error: `Réponse serveur vide (${res.status})` };
  }

  try {
    return { json: JSON.parse(text) as T, error: null };
  } catch {
    if (res.status === 404) {
      return {
        json: null,
        error:
          "API commandes boutique introuvable (404). Mettez à jour le backoffice ou vérifiez l’URL.",
      };
    }
    return { json: null, error: `Réponse serveur invalide (${res.status})` };
  }
}

function mapFetchError(e: unknown, backofficeUrl: string): string {
  if (e instanceof TypeError) {
    return `Impossible de joindre le backoffice (${backofficeUrl}). Vérifiez l’URL et le réseau.`;
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return "Réseau indisponible";
}

export async function fetchCommandesBoutique(
  magasinCode: string,
  caisseCode: string,
): Promise<{ commandes: CommandeBoutiqueItem[]; error: string | null }> {
  const config = await getCaisseConfig();
  if (!config.caisseToken.trim()) {
    return { commandes: [], error: "Token caisse introuvable (caisse.config.json)" };
  }

  try {
    const res = await caisseApiFetch(
      `/api/caisse/commandes-boutique?magasin=${encodeURIComponent(magasinCode)}&caisse=${encodeURIComponent(caisseCode)}`,
    );
    const parsed = await readCaisseApiJson<{ commandes?: CommandeBoutiqueItem[]; error?: string }>(res);
    if (parsed.error) {
      return { commandes: [], error: parsed.error };
    }
    const json = parsed.json;
    if (!json) {
      return { commandes: [], error: `Erreur API (${res.status})` };
    }
    if (!res.ok) {
      return { commandes: [], error: typeof json.error === "string" ? json.error : "Erreur API" };
    }
    return { commandes: json.commandes ?? [], error: null };
  } catch (e) {
    return { commandes: [], error: mapFetchError(e, config.backofficeUrl) };
  }
}

export async function fetchCommandesAEncaisser(
  magasinCode: string,
): Promise<{ commandes: CommandeEncaissementItem[]; error: string | null }> {
  const config = await getCaisseConfig();
  if (!config.caisseToken.trim()) {
    return { commandes: [], error: "Token caisse introuvable (caisse.config.json)" };
  }

  try {
    const res = await caisseApiFetch(
      `/api/caisse/commandes-boutique/a-encaisser?magasin=${encodeURIComponent(magasinCode)}`,
    );
    const parsed = await readCaisseApiJson<{ commandes?: CommandeEncaissementItem[]; error?: string }>(res);
    if (parsed.error) {
      return { commandes: [], error: parsed.error };
    }
    const json = parsed.json;
    if (!json) {
      return { commandes: [], error: `Erreur API (${res.status})` };
    }
    if (!res.ok) {
      return { commandes: [], error: typeof json.error === "string" ? json.error : "Erreur API" };
    }
    return { commandes: json.commandes ?? [], error: null };
  } catch (e) {
    return { commandes: [], error: mapFetchError(e, config.backofficeUrl) };
  }
}

export async function collectCommandeBoutiquePayment(input: {
  cartId: string;
  magasinCode: string;
  caisseCode: string;
  ticketNumber: number;
  soldAt: string;
  total: number;
  payments: Array<{ mode: string; amount: number }>;
}): Promise<{ ok: boolean; error: string | null }> {
  const config = await getCaisseConfig();
  try {
    const res = await caisseApiFetch("/api/caisse/commandes-boutique/collect-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = await readCaisseApiJson<{ error?: string }>(res);
    if (parsed.error) return { ok: false, error: parsed.error };
    const json = parsed.json;
    if (!json || !res.ok) return { ok: false, error: json?.error ?? "Encaissement impossible" };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: mapFetchError(e, config.backofficeUrl) };
  }
}

export async function lockCommandeBoutique(input: {
  cartId: string;
  magasinCode: string;
  caisseCode: string;
}): Promise<{ ok: boolean; clientId: string | null; clientName: string | null; error: string | null }> {
  const config = await getCaisseConfig();
  try {
    const res = await caisseApiFetch("/api/caisse/commandes-boutique/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = await readCaisseApiJson<{
      ok?: boolean;
      clientId?: string | null;
      clientName?: string | null;
      error?: string;
    }>(res);
    if (parsed.error) {
      return { ok: false, clientId: null, clientName: null, error: parsed.error };
    }
    const json = parsed.json;
    if (!json || !res.ok) {
      return { ok: false, clientId: null, clientName: null, error: json?.error ?? "Verrou refusé" };
    }
    return {
      ok: true,
      clientId: json.clientId ?? null,
      clientName: json.clientName ?? null,
      error: null,
    };
  } catch (e) {
    return { ok: false, clientId: null, clientName: null, error: mapFetchError(e, config.backofficeUrl) };
  }
}

export async function unlockCommandeBoutique(input: {
  cartId: string;
  magasinCode: string;
  caisseCode: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const config = await getCaisseConfig();
  try {
    const res = await caisseApiFetch("/api/caisse/commandes-boutique/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = await readCaisseApiJson<{ error?: string }>(res);
    if (parsed.error) return { ok: false, error: parsed.error };
    const json = parsed.json;
    if (!json || !res.ok) return { ok: false, error: json?.error ?? "Erreur" };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: mapFetchError(e, config.backofficeUrl) };
  }
}

export async function linkCommandeBoutique(input: {
  cartId: string;
  magasinCode: string;
  caisseCode: string;
  ticketNumber: number;
  soldAt: string;
  total: number;
  payments: Array<{ mode: string; amount: number }>;
  lines: Array<{
    productId: string;
    productCode: string;
    productName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    salesUnit: "kg" | "unit";
  }>;
}): Promise<{ ok: boolean; error: string | null }> {
  const config = await getCaisseConfig();
  try {
    const res = await caisseApiFetch("/api/caisse/commandes-boutique/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = await readCaisseApiJson<{ error?: string }>(res);
    if (parsed.error) return { ok: false, error: parsed.error };
    const json = parsed.json;
    if (!json || !res.ok) return { ok: false, error: json?.error ?? "Lien impossible" };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: mapFetchError(e, config.backofficeUrl) };
  }
}

export async function fetchCommandeBoutiqueTicketEscPosBase64(input: {
  cartId: string;
  ticketRef: string;
  paymentStatus: string;
}): Promise<{ base64: string | null; error: string | null }> {
  const config = await getCaisseConfig();
  try {
    const params = new URLSearchParams({
      cartId: input.cartId,
      ticketRef: input.ticketRef,
      paymentStatus: input.paymentStatus,
      encode: "base64",
    });
    const res = await caisseApiFetch(`/api/caisse/commandes-boutique/ticket?${params.toString()}`);
    const parsed = await readCaisseApiJson<{ base64?: string; error?: string }>(res);
    if (parsed.error) return { base64: null, error: parsed.error };
    const json = parsed.json;
    if (!json || !res.ok) {
      return { base64: null, error: json?.error ?? "Ticket commande indisponible" };
    }
    return { base64: json.base64 ?? null, error: null };
  } catch (e) {
    return { base64: null, error: mapFetchError(e, config.backofficeUrl) };
  }
}
