import type { SupabaseClient } from "@supabase/supabase-js";

export async function userHasMagasin(
  supabase: SupabaseClient,
  userId: string,
  magasinId: string,
): Promise<boolean> {
  const { data: links, error: le } = await supabase
    .from("profile_magasins")
    .select("magasin_id")
    .eq("user_id", userId);
  if (le) return false;

  if (links && links.length > 0) {
    return links.some((l) => l.magasin_id === magasinId);
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(slug, is_full_access)")
    .eq("user_id", userId)
    .maybeSingle();
  const role = prof?.roles as { slug: string; is_full_access?: boolean } | null | undefined;
  if (role?.slug === "administrateur" || role?.is_full_access) {
    const { data: m, error: me } = await supabase.from("magasins").select("id").eq("id", magasinId).maybeSingle();
    if (me) return false;
    return Boolean(m);
  }

  return false;
}
