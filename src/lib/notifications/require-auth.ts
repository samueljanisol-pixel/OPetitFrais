import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadUserAccessByUserId } from "@/lib/auth/load-user-access";

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

  const access = await loadUserAccessByUserId(user.id);
  if (!access) {
    return { ok: false, status: 500, error: "Impossible de vérifier les droits" };
  }

  return {
    ok: true,
    userId: user.id,
    permissions: access.permissions,
    isFullAccess: access.isFullAccess,
  };
}
