import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeProfileRole } from "@/lib/auth/normalize-profile-role";

export async function requireAuthenticatedUser(): Promise<
  | { ok: true; userId: string; permissions: string[]; isFullAccess: boolean }
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

  const role = normalizeProfileRole(
    prof?.roles as { is_full_access: boolean } | { is_full_access: boolean }[] | null | undefined,
  );
  const isFullAccess = role?.is_full_access === true;

  const { data: keysRaw, error } = await supabase.rpc("get_my_permission_keys");
  if (error) {
    return { ok: false, status: 500, error: "Impossible de vérifier les droits" };
  }

  return {
    ok: true,
    userId: user.id,
    permissions: (keysRaw as string[]) ?? [],
    isFullAccess,
  };
}
