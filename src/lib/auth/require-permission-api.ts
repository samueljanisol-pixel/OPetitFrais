import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(is_full_access)")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = prof?.roles as { is_full_access: boolean } | null | undefined;
  const isFull = role?.is_full_access ?? false;

  const { data: keysRaw, error } = await supabase.rpc("get_my_permission_keys");
  if (error) {
    return { ok: false, status: 500, error: "Impossible de vérifier les droits" };
  }
  const keys = new Set((keysRaw as string[]) ?? []);
  return resolveGate(keys, isFull, user.id, key);
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

  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(is_full_access)")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = prof?.roles as { is_full_access: boolean } | null | undefined;
  const isFull = role?.is_full_access ?? false;

  const { data: keysRaw, error } = await supabase.rpc("get_my_permission_keys");
  if (error) {
    return { ok: false, status: 500, error: "Impossible de vérifier les droits" };
  }
  const keys = new Set((keysRaw as string[]) ?? []);
  return resolveGate(keys, isFull, user.id, anyOf);
}
