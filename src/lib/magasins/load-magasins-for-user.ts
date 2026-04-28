import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionMagasin } from "@/lib/auth/session-types";

type RoleInfo = { slug: string | null; is_full_access: boolean } | null | undefined;

function mapProfileMagasins(
  pmRows: { magasins: unknown }[] | null,
): SessionMagasin[] {
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
 * Magasins visibles pour la session : tous les magasins pour le rôle « administrateur »,
 * sinon ceux de profile_magasins.
 */
export async function loadMagasinsForUser(
  supabase: SupabaseClient,
  userId: string,
  role: RoleInfo,
): Promise<SessionMagasin[]> {
  if (role?.slug === "administrateur") {
    const { data, error } = await supabase
      .from("magasins")
      .select("id, code, nom")
      .order("sort_order", { ascending: true })
      .order("nom", { ascending: true });
    if (!error && data && data.length > 0) {
      return data as SessionMagasin[];
    }
    const { data: pmRows } = await supabase
      .from("profile_magasins")
      .select("magasins(id, code, nom)")
      .eq("user_id", userId);
    return mapProfileMagasins(pmRows ?? []);
  }

  const { data: pmRows, error: pmErr } = await supabase
    .from("profile_magasins")
    .select("magasins(id, code, nom)")
    .eq("user_id", userId);
  if (pmErr) {
    return [];
  }
  return mapProfileMagasins(pmRows ?? []);
}
