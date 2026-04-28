import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { MagasinSaisieProvider } from "./MagasinSaisieContext";

export default async function SaisieLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  let magasins: { id: string; code: string; nom: string }[] = [];
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles(slug, is_full_access)")
      .eq("user_id", userId)
      .maybeSingle();
    const role = profile?.roles as { slug: string; is_full_access: boolean } | null | undefined;
    magasins = await loadMagasinsForUser(supabase, userId, role);
  }

  return <MagasinSaisieProvider magasins={magasins}>{children}</MagasinSaisieProvider>;
}
