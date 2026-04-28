import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: prof, error } = await supabase
    .from("profiles")
    .select("roles(slug)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: "Impossible de vérifier le profil" };
  }

  const role = prof?.roles as { slug: string } | null | undefined;
  if (role?.slug !== "administrateur") {
    return { ok: false, status: 403, error: "Réservé à l’administrateur" };
  }

  return { ok: true, userId: user.id };
}
