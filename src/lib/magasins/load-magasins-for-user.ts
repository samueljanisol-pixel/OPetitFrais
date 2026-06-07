import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionMagasin } from "@/lib/auth/session-types";

type RoleInfo = { slug: string | null; is_full_access: boolean } | null | undefined;

export type UserMagasinsLoad = {
  magasins: SessionMagasin[];
  /** true si l'utilisateur a des lignes dans profile_magasins (périmètre explicite). */
  restricted: boolean;
};

function mapProfileMagasins(pmRows: { magasins: unknown }[] | null): SessionMagasin[] {
  return (pmRows ?? [])
    .map((row) => {
      const raw = row.magasins as unknown;
      const m = (Array.isArray(raw) ? raw[0] : raw) as
        | { id: string; code: string; nom: string }
        | null
        | undefined;
      return m?.id ? { id: m.id, code: m.code, nom: m.nom } : null;
    })
    .filter(Boolean) as SessionMagasin[];
}

/**
 * Magasins visibles pour la session :
 * 1. profile_magasins s'il existe (tout rôle) ;
 * 2. sinon tous les magasins pour administrateur ou rôle is_full_access ;
 * 3. sinon aucun.
 */
export async function loadMagasinsForUser(
  supabase: SupabaseClient,
  userId: string,
  role: RoleInfo,
): Promise<UserMagasinsLoad> {
  const { data: pmRows, error: pmErr } = await supabase
    .from("profile_magasins")
    .select("magasins(id, code, nom)")
    .eq("user_id", userId);

  if (!pmErr && pmRows && pmRows.length > 0) {
    return { magasins: mapProfileMagasins(pmRows), restricted: true };
  }

  if (role?.slug === "administrateur" || role?.is_full_access) {
    const { data, error } = await supabase
      .from("magasins")
      .select("id, code, nom")
      .order("sort_order", { ascending: true })
      .order("nom", { ascending: true });
    if (!error && data) {
      return { magasins: data as SessionMagasin[], restricted: false };
    }
  }

  return { magasins: [], restricted: false };
}
