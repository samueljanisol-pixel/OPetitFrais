export type CaisseIdentityFields = {
  backofficeUrl: string;
  caisseToken: string;
  magasinCode: string;
  caisseCode: string;
  posteId: string;
};

export type CaisseIdentityDraft = Partial<CaisseIdentityFields>;

export type CaisseIdentityStatus = {
  complete: boolean;
  missing: string[];
  configPath: string;
  configFileExists: boolean;
  draft: CaisseIdentityDraft;
  isTestMagasin: boolean;
};

const IDENTITY_KEYS = [
  "backofficeUrl",
  "caisseToken",
  "magasinCode",
  "caisseCode",
  "posteId",
] as const;

export function parseMagasinNumeric(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseCaisseNumeric(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatMagasinCode(raw: string): string | null {
  const n = parseMagasinNumeric(raw);
  if (n == null) return null;
  return String(n).padStart(2, "0");
}

export function formatCaisseCode(raw: string): string | null {
  const n = parseCaisseNumeric(raw);
  if (n == null) return null;
  return String(n).padStart(2, "0");
}

export function isTestMagasin(magasinCode: string): boolean {
  return parseMagasinNumeric(magasinCode) === 0;
}

export function validateIdentityDraft(
  draft: CaisseIdentityDraft,
): { ok: true; value: CaisseIdentityFields } | { ok: false; error: string } {
  const backofficeUrl = draft.backofficeUrl?.trim() ?? "";
  const caisseToken = draft.caisseToken?.trim() ?? "";
  const magasinCode = formatMagasinCode(draft.magasinCode?.trim() ?? "");
  const caisseCode = formatCaisseCode(draft.caisseCode?.trim() ?? "");
  const posteId = draft.posteId?.trim() ?? "";

  if (!backofficeUrl) {
    return { ok: false, error: "URL backoffice requise" };
  }
  try {
    const url = new URL(backofficeUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "URL backoffice invalide (http ou https)" };
    }
  } catch {
    return { ok: false, error: "URL backoffice invalide" };
  }

  if (!caisseToken) {
    return { ok: false, error: "Token caisse requis" };
  }

  if (!magasinCode) {
    return { ok: false, error: "Numéro magasin invalide (0 = tests)" };
  }

  if (!caisseCode) {
    return { ok: false, error: "Numéro caisse invalide (doit être > 0)" };
  }

  if (!posteId) {
    return { ok: false, error: "Identifiant poste manquant" };
  }

  return {
    ok: true,
    value: {
      backofficeUrl: backofficeUrl.replace(/\/$/, ""),
      caisseToken,
      magasinCode,
      caisseCode,
      posteId,
    },
  };
}

export function evaluateIdentityFromRaw(
  raw: Record<string, unknown> | null,
  configPath: string,
  configFileExists: boolean,
): CaisseIdentityStatus {
  const draft: CaisseIdentityDraft = {
    backofficeUrl: typeof raw?.backofficeUrl === "string" ? raw.backofficeUrl : "",
    caisseToken: typeof raw?.caisseToken === "string" ? raw.caisseToken : "",
    magasinCode: typeof raw?.magasinCode === "string" ? raw.magasinCode : "",
    caisseCode: typeof raw?.caisseCode === "string" ? raw.caisseCode : "",
    posteId: typeof raw?.posteId === "string" ? raw.posteId : "",
  };

  const missing: string[] = [];

  for (const key of IDENTITY_KEYS) {
    const val = draft[key]?.trim() ?? "";
    if (!val) {
      missing.push(key);
    }
  }

  if (draft.magasinCode?.trim()) {
    const magasin = formatMagasinCode(draft.magasinCode);
    if (!magasin) missing.push("magasinCode");
  }

  if (draft.caisseCode?.trim()) {
    const caisse = formatCaisseCode(draft.caisseCode);
    if (!caisse) missing.push("caisseCode");
  }

  const magasinFormatted = formatMagasinCode(draft.magasinCode ?? "") ?? "00";

  return {
    complete: missing.length === 0,
    missing: [...new Set(missing)],
    configPath,
    configFileExists,
    draft,
    isTestMagasin: isTestMagasin(magasinFormatted),
  };
}
