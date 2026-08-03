import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import {
  computeCaisseLockState,
  clearExpiredCaisseLockIfNeeded,
  type ShopCartRow,
} from "@/lib/commandes-client/workflow";
import { listCommandesClient, resolveMagasinIdByCode } from "@/lib/commandes-client/queries";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const magasinCode = (req.nextUrl.searchParams.get("magasin") ?? "").trim();
  const caisseCode = (req.nextUrl.searchParams.get("caisse") ?? "C01").trim();
  if (!magasinCode) {
    return NextResponse.json({ error: "magasin requis" }, { status: 400, headers: CORS_HEADERS });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase indisponible" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const { magasinId, error: magErr } = await resolveMagasinIdByCode(supabase, magasinCode);
  if (magErr) {
    return NextResponse.json({ error: magErr }, { status: 404, headers: CORS_HEADERS });
  }
  if (!magasinId) {
    return NextResponse.json({ error: "Magasin introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const { items, error } = await listCommandesClient(supabase, {
    workflowStatus: "a_passer_caisse",
    magasinId,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500, headers: CORS_HEADERS });
  }

  const commandes = [];
  for (const item of items) {
    const row = item as unknown as ShopCartRow;
    await clearExpiredCaisseLockIfNeeded(supabase, {
      id: item.id,
      workflow_status: item.workflow_status,
      caisse_locked_at: item.caisse_locked_at,
      caisse_lock_magasin_code: item.caisse_lock_magasin_code,
      caisse_lock_caisse_code: item.caisse_lock_caisse_code,
    } as ShopCartRow);

    const lock = computeCaisseLockState(
      {
        caisse_locked_at: item.caisse_locked_at,
        caisse_lock_magasin_code: item.caisse_lock_magasin_code,
        caisse_lock_caisse_code: item.caisse_lock_caisse_code,
      } as ShopCartRow,
      magasinCode,
      caisseCode,
    );

    commandes.push({
      cartId: item.id,
      cartNumber: item.cart_number,
      clientId: item.client_id,
      clientName: item.client_nom,
      fulfillmentMode: item.fulfillment_mode,
      montantEstime: item.montant_total,
      caisseLockState: lock.state,
      caisseLockLabel: lock.label,
    });
  }

  return NextResponse.json({ ok: true, commandes }, { headers: CORS_HEADERS });
}
