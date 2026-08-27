import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeProfileRole, type ProfileRoleRow } from "@/lib/auth/normalize-profile-role";

export type UserAccessRow = {
  login: string | null;
  prenom: string;
  nom: string;
  role_id: string | null;
  ui_locale: string | null;
  role: ProfileRoleRow | null;
  isFullAccess: boolean;
  permissions: string[];
};

function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Charge profil + rôle + permissions via service role (après auth.getUser()).
 * Contourne les échecs PostgREST « JWT issued at future » (PGRST303) quand
 * l’horloge / JWT et PostgREST divergent : getUser() peut réussir alors que
 * rpc/select avec le JWT utilisateur échouent.
 */
export async function loadUserAccessByUserId(userId: string): Promise<UserAccessRow | null> {
  const service = createServiceClient();
  if (!service) return null;

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("login, prenom, nom, role_id, ui_locale, roles(name, slug, is_full_access)")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileErr || !profile) {
    return null;
  }

  const role = normalizeProfileRole(
    profile.roles as ProfileRoleRow | ProfileRoleRow[] | null | undefined,
  );
  const isFullAccess = role?.is_full_access === true || role?.slug === "administrateur";

  let permissions: string[] = [];
  if (isFullAccess) {
    const { data: allKeys } = await service.from("permissions").select("key").order("key");
    permissions = (allKeys ?? [])
      .map((r) => r.key)
      .filter((k): k is string => typeof k === "string");
  } else if (profile.role_id) {
    const { data: rp } = await service
      .from("role_permissions")
      .select("permissions(key)")
      .eq("role_id", profile.role_id);
    permissions = (rp ?? []).flatMap((row) => {
      const p = row.permissions as { key: string | null } | { key: string | null }[] | null;
      const list = p == null ? [] : Array.isArray(p) ? p : [p];
      return list.flatMap((x) => (typeof x.key === "string" && x.key.length > 0 ? [x.key] : []));
    });
  }

  return {
    login: profile.login ?? null,
    prenom: (profile.prenom ?? "").trim(),
    nom: (profile.nom ?? "").trim(),
    role_id: profile.role_id ?? null,
    ui_locale: profile.ui_locale ?? null,
    role,
    isFullAccess,
    permissions,
  };
}
