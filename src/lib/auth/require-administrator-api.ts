import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function isUserAdministrator(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("roles(slug)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !prof) {
    return false;
  }
  const role = prof.roles as { slug?: string } | { slug?: string }[] | null | undefined;
  const slug = Array.isArray(role) ? role[0]?.slug : role?.slug;
  return slug === "administrateur";
}

/**
 * Réserve la route au rôle système « administrateur » (slug), pas seulement aux permissions métier.
 */
export async function requireApiAdministrator(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, status: 401, error: "Non connecté" };
  }

  const isAdmin = await isUserAdministrator(supabase, user.id);
  if (!isAdmin) {
    return { ok: false, status: 403, error: "Réservé à l’administrateur" };
  }

  return { ok: true, userId: user.id };
}
