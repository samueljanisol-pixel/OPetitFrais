import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket, CAISSE_API_CORS_HEADERS } from "@/lib/caisse/authorize-caisse-ticket";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeMagasinCode(raw: string): string {
  return raw.replace(/\D/g, "").padStart(2, "0").slice(-2);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CAISSE_API_CORS_HEADERS });
}

/**
 * Caissiers du magasin pour cache local (login hors ligne).
 *
 * GET /api/caisse/caissiers?token=…&magasin=01
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const magasinRaw = req.nextUrl.searchParams.get("magasin")?.trim() ?? "";
  const magasinCode = normalizeMagasinCode(magasinRaw);
  if (!magasinRaw.replace(/\D/g, "")) {
    return NextResponse.json(
      { ok: false, error: "Paramètre magasin requis" },
      { status: 400, headers: CAISSE_API_CORS_HEADERS },
    );
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Service role non configurée" },
      { status: 503, headers: CAISSE_API_CORS_HEADERS },
    );
  }

  const { data: profiles, error } = await service
    .from("profiles")
    .select(
      "user_id, prenom, nom, caisse_pin_hash, profile_magasins(magasin_id, magasins(id, code))",
    )
    .eq("is_caissier", true)
    .not("caisse_pin_hash", "is", null)
    .order("nom", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: CAISSE_API_CORS_HEADERS },
    );
  }

  type MagasinRel = { id?: string; code?: string | null };
  type LinkRow = {
    magasin_id?: string;
    magasins?: MagasinRel | MagasinRel[] | null;
  };

  const caissiers = ((profiles ?? []) as Array<{
    user_id: string;
    prenom: string | null;
    nom: string | null;
    caisse_pin_hash: string | null;
    profile_magasins?: LinkRow[] | null;
  }>).flatMap((row) => {
    const pinHash = typeof row.caisse_pin_hash === "string" ? row.caisse_pin_hash.trim() : "";
    if (!pinHash) return [];

    const links = row.profile_magasins ?? [];
    const matches = links.some((link) => {
      const raw = link.magasins == null ? [] : Array.isArray(link.magasins) ? link.magasins : [link.magasins];
      return raw.some((m) => {
        const code = typeof m.code === "string" ? normalizeMagasinCode(m.code) : "";
        return code === magasinCode;
      });
    });
    if (!matches) return [];

    return [
      {
        userId: row.user_id,
        prenom: (row.prenom ?? "").trim(),
        nom: (row.nom ?? "").trim(),
        pinHash,
      },
    ];
  });

  return NextResponse.json(
    {
      ok: true,
      caissiers,
      fetchedAt: new Date().toISOString(),
    },
    { headers: CAISSE_API_CORS_HEADERS },
  );
}
