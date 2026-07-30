import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type RegisterCaissePosteInput = {
  posteId: string;
  magasinCode: string;
  caisseCode: string;
  hostname?: string | null;
  appVersion?: string | null;
};

export type RegisterCaissePosteResult =
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
      status: number;
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function isTestMagasinCode(magasinCode: string): boolean {
  const n = parseMagasinNumeric(magasinCode);
  return n === 0;
}

export async function registerCaissePoste(
  input: RegisterCaissePosteInput,
): Promise<RegisterCaissePosteResult> {
  const posteId = input.posteId.trim();
  if (!UUID_RE.test(posteId)) {
    return { ok: false, error: "Identifiant poste invalide", status: 400 };
  }

  const magasinFormatted = formatMagasinCode(input.magasinCode);
  if (!magasinFormatted) {
    return { ok: false, error: "Numéro magasin invalide", status: 400 };
  }

  const caisseFormatted = formatCaisseCode(input.caisseCode);
  if (!caisseFormatted) {
    return {
      ok: false,
      error: "Numéro caisse invalide (doit être supérieur à 0)",
      status: 400,
    };
  }

  const caisseNum = parseCaisseNumeric(caisseFormatted);
  if (caisseNum == null) {
    return { ok: false, error: "Numéro caisse invalide", status: 400 };
  }

  const isTestMagasin = isTestMagasinCode(magasinFormatted);

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Supabase non configuré";
    return { ok: false, error: msg, status: 503 };
  }

  if (!isTestMagasin) {
    const { data: conflict, error: conflictError } = await supabase
      .from("caisse_postes")
      .select("id")
      .eq("magasin_code", magasinFormatted)
      .eq("caisse_num", caisseNum)
      .neq("id", posteId)
      .maybeSingle();

    if (conflictError) {
      return { ok: false, error: conflictError.message, status: 503 };
    }
    if (conflict) {
      return {
        ok: false,
        error: `La caisse ${caisseFormatted} est déjà utilisée pour le magasin ${magasinFormatted}`,
        status: 409,
      };
    }
  }

  const hostname =
    typeof input.hostname === "string" && input.hostname.trim().length > 0
      ? input.hostname.trim().slice(0, 255)
      : null;
  const appVersion =
    typeof input.appVersion === "string" && input.appVersion.trim().length > 0
      ? input.appVersion.trim().slice(0, 64)
      : null;

  const { error: upsertError } = await supabase.from("caisse_postes").upsert(
    {
      id: posteId,
      magasin_code: magasinFormatted,
      caisse_num: caisseNum,
      is_test_magasin: isTestMagasin,
      hostname,
      app_version: appVersion,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    if (upsertError.code === "23505") {
      return {
        ok: false,
        error: `La caisse ${caisseFormatted} est déjà utilisée pour le magasin ${magasinFormatted}`,
        status: 409,
      };
    }
    return { ok: false, error: upsertError.message, status: 503 };
  }

  return {
    ok: true,
    posteId,
    magasinCode: magasinFormatted,
    caisseCode: caisseFormatted,
    isTestMagasin,
  };
}
