import type { CaisseIdentityDraft } from "../lib/caisse-identity";

export type RegisterPosteResult =
  | {
      ok: true;
      posteId: string;
      magasinCode: string;
      caisseCode: string;
      isTestMagasin: boolean;
    }
  | {
      ok: false;
      error: string;
    };

type RegisterPosteInput = CaisseIdentityDraft & {
  posteId: string;
};

export async function registerPosteOnServer(
  input: RegisterPosteInput,
): Promise<RegisterPosteResult> {
  const backofficeUrl = input.backofficeUrl?.trim().replace(/\/$/, "") ?? "";
  const caisseToken = input.caisseToken?.trim() ?? "";
  const posteId = input.posteId.trim();

  if (!backofficeUrl || !caisseToken) {
    return { ok: false, error: "URL backoffice et token requis" };
  }

  const url = `${backofficeUrl}/api/caisse/poste/register?token=${encodeURIComponent(caisseToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-caisse-ticket-token": caisseToken,
      },
      body: JSON.stringify({
        posteId,
        magasinCode: input.magasinCode?.trim() ?? "",
        caisseCode: input.caisseCode?.trim() ?? "",
        hostname: typeof window !== "undefined" ? window.location.hostname : null,
        appVersion: "0.1.0",
      }),
    });

    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      posteId?: string;
      magasinCode?: string;
      caisseCode?: string;
      isTestMagasin?: boolean;
    };

    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }

    if (!json.posteId || !json.magasinCode || !json.caisseCode) {
      return { ok: false, error: "Réponse serveur incomplète" };
    }

    return {
      ok: true,
      posteId: json.posteId,
      magasinCode: json.magasinCode,
      caisseCode: json.caisseCode,
      isTestMagasin: json.isTestMagasin === true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return { ok: false, error: msg };
  }
}
