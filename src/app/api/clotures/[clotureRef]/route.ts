import { NextRequest, NextResponse } from "next/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { normalizeProfileRole } from "@/lib/auth/normalize-profile-role";
import {
  allowedMagasinCodes,
  CLOTURE_SELECT,
  mapClotureDetail,
  rowVisible,
  type ClotureRow,
} from "@/lib/clotures/queries";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ clotureRef: string }> };

async function loadVisibleCloture(clotureRef: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(slug, is_full_access)")
    .eq("user_id", userId)
    .maybeSingle();
  const role = normalizeProfileRole(
    prof?.roles as
      | { slug: string | null; is_full_access: boolean }
      | { slug: string | null; is_full_access: boolean }[]
      | null
      | undefined,
  );
  const magasinsLoad = await loadMagasinsForUser(supabase, userId, {
    slug: role?.slug ?? null,
    is_full_access: role?.is_full_access === true,
  });
  const allowed = allowedMagasinCodes(magasinsLoad.magasins, magasinsLoad.restricted);
  const service = createSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("caisse_cloture")
    .select(CLOTURE_SELECT)
    .eq("cloture_ref", clotureRef)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data) return { ok: false as const, status: 404, error: "Clôture introuvable" };
  const row = data as ClotureRow;
  if (!rowVisible(row, allowed)) return { ok: false as const, status: 404, error: "Clôture introuvable" };
  return { ok: true as const, supabase: service, row };
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const gate = await requireAnyApiPermission(["ventes.read", "ventes.write"]);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { clotureRef } = await ctx.params;
  const ref = decodeURIComponent(clotureRef).trim();
  if (!ref) return NextResponse.json({ error: "Référence manquante" }, { status: 400 });

  const loaded = await loadVisibleCloture(ref, gate.userId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  return NextResponse.json({ cloture: mapClotureDetail(loaded.row) });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const gate = await requireApiPermission("ventes.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { clotureRef } = await ctx.params;
  const ref = decodeURIComponent(clotureRef).trim();
  if (!ref) return NextResponse.json({ error: "Référence manquante" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const rowIn = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const asCount = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const n = Math.round(value);
    return n >= 0 ? n : null;
  };
  const bills200 = asCount(rowIn.bills200);
  const bills100 = asCount(rowIn.bills100);
  const bills50 = asCount(rowIn.bills50);
  const bills20 = asCount(rowIn.bills20);
  if (bills200 == null || bills100 == null || bills50 == null || bills20 == null) {
    return NextResponse.json({ error: "Saisie billets invalide" }, { status: 400 });
  }

  const loaded = await loadVisibleCloture(ref, gate.userId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  const { data, error } = await loaded.supabase
    .from("caisse_cloture")
    .update({
      verify_bills200: bills200,
      verify_bills100: bills100,
      verify_bills50: bills50,
      verify_bills20: bills20,
      status: "verifiee",
      verified_at: new Date().toISOString(),
      verified_by: gate.userId,
    })
    .eq("cloture_ref", ref)
    .select(CLOTURE_SELECT)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Enregistrement impossible" }, { status: 500 });
  }
  return NextResponse.json({ cloture: mapClotureDetail(data as ClotureRow) });
}
