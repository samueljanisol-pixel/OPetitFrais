import { NextResponse } from "next/server";
import { requireCommandesClientRead, requireCommandesClientValidate } from "@/lib/commandes-client/api-auth";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const gate = await requireCommandesClientRead();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(slug, is_full_access)")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const roleRaw = prof?.roles as
    | { slug: string | null; is_full_access: boolean }
    | { slug: string | null; is_full_access: boolean }[]
    | null;
  const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;

  const { magasins, restricted } = await loadMagasinsForUser(supabase, gate.userId, role ?? null);
  if (magasins.length > 0) {
    return NextResponse.json({ magasins, restricted });
  }

  const validateGate = await requireCommandesClientValidate();
  if (!validateGate.ok) {
    return NextResponse.json({ magasins: [], restricted: false });
  }

  const { data, error } = await supabase
    .from("magasins")
    .select("id, code, nom")
    .eq("type", "magasin")
    .order("sort_order", { ascending: true })
    .order("nom", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ magasins: data ?? [], restricted: false });
}
