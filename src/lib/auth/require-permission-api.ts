import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadUserAccessByUserId } from "@/lib/auth/load-user-access";

async function resolveGate(
  keys: Set<string>,
  isFull: boolean,
  userId: string,
  need: string | string[],
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  if (isFull) return { ok: true, userId };
  const required = Array.isArray(need) ? need : [need];
  const ok = required.some((k) => keys.has(k));
  if (!ok) {
    return { ok: false, status: 403, error: "Permission refusée" };
  }
  return { ok: true, userId };
}

async function gateForUser(
  userId: string,
  need: string | string[],
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const access = await loadUserAccessByUserId(userId);
  if (!access) {
    return { ok: false, status: 500, error: "Impossible de vérifier les droits" };
  }
  return resolveGate(new Set(access.permissions), access.isFullAccess, userId, need);
}

export async function requireApiPermission(key: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, status: 401, error: "Non connecté" };
  }
  return gateForUser(user.id, key);
}

/** Au moins une des permissions (ou accès total). */
export async function requireAnyApiPermission(
  anyOf: string[],
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, status: 401, error: "Non connecté" };
  }
  return gateForUser(user.id, anyOf);
}
