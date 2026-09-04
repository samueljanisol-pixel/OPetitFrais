import { NextRequest, NextResponse } from "next/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { normalizeProfileRole } from "@/lib/auth/normalize-profile-role";
import {
  allowedMagasinCodes,
  CLOTURE_SELECT,
  mapClotureListItem,
  rowVisible,
  type ClotureRow,
} from "@/lib/clotures/queries";
import { asClotureStatus } from "@/lib/clotures/types";
import { normalizePosCode } from "@/lib/clotures/normalize-codes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  const statusParam = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const magasinParam = normalizePosCode(req.nextUrl.searchParams.get("magasin") ?? "");
  const caisseParam = normalizePosCode(req.nextUrl.searchParams.get("caisse") ?? "");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("caisse_cloture").select(CLOTURE_SELECT);
  if (statusParam === "a_verifier" || statusParam === "verifiee") {
    query = query.eq("status", statusParam);
  }
  if (magasinParam) query = query.eq("magasin_code", magasinParam);
  if (caisseParam) query = query.eq("caisse_code", caisseParam);

  const { data, error } = await query.order("closed_at", { ascending: false }).limit(300);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clotures = ((data ?? []) as ClotureRow[])
    .filter((row) => rowVisible(row, allowed))
    .map(mapClotureListItem);

  return NextResponse.json({
    clotures,
    counts: {
      all: clotures.length,
      a_verifier: clotures.filter((c) => asClotureStatus(c.status) === "a_verifier").length,
      verifiee: clotures.filter((c) => c.status === "verifiee").length,
    },
  });
}
