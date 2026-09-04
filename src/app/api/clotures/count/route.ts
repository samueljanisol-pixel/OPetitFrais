import { NextResponse } from "next/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { normalizeProfileRole } from "@/lib/auth/normalize-profile-role";
import { allowedMagasinCodes } from "@/lib/clotures/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAnyApiPermission(["ventes.read", "ventes.write"]);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(slug, is_full_access)")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const role = normalizeProfileRole(
    prof?.roles as
      | { slug: string | null; is_full_access: boolean }
      | { slug: string | null; is_full_access: boolean }[]
      | null
      | undefined,
  );
  const magasinsLoad = await loadMagasinsForUser(supabase, gate.userId, {
    slug: role?.slug ?? null,
    is_full_access: role?.is_full_access === true,
  });
  const allowed = allowedMagasinCodes(magasinsLoad.magasins, magasinsLoad.restricted);
  if (allowed && allowed.length === 0) {
    return NextResponse.json({ a_verifier: 0 });
  }

  const service = createSupabaseServiceRoleClient();
  let query = service
    .from("caisse_cloture")
    .select("cloture_ref", { count: "exact", head: true })
    .eq("status", "a_verifier");
  if (allowed) query = query.in("magasin_code", allowed);

  const { count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ a_verifier: count ?? 0 });
}
