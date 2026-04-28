import type { SupabaseClient } from "@supabase/supabase-js";

export async function userHasMagasin(
  supabase: SupabaseClient,
  userId: string,
  magasinId: string,
): Promise<boolean> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(slug)")
    .eq("user_id", userId)
    .maybeSingle();
  const role = prof?.roles as { slug: string } | null | undefined;
  if (role?.slug === "administrateur") {
    const { data: m, error: me } = await supabase.from("magasins").select("id").eq("id", magasinId).maybeSingle();
    if (me) return false;
    return Boolean(m);
  }

  const { data, error } = await supabase
    .from("profile_magasins")
    .select("magasin_id")
    .eq("user_id", userId)
    .eq("magasin_id", magasinId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}
