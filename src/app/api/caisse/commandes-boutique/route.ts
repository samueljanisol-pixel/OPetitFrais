import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { isTestMagasinCode } from "@/lib/caisse/magasin-code";
import {
  CAISSE_ACTIVE_STATUSES,
  computeCaisseLockState,
  clearExpiredCaisseLockIfNeeded,
  type ShopCartRow,
  type WorkflowStatus,
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

async function mapCommandes(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  items: Awaited<ReturnType<typeof listCommandesClient>>["items"],
  magasinCode: string,
  caisseCode: string,
) {
  const commandes = [];
  for (const item of items) {
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
      workflowStatus: item.workflow_status as WorkflowStatus | null,
      caisseLockState: lock.state,
      caisseLockLabel: lock.label,
    });
  }
  return commandes;
}

export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const magasinCode = (req.nextUrl.searchParams.get("magasin") ?? "").trim();
  const caisseCode = (req.nextUrl.searchParams.get("caisse") ?? "C01").trim();
  if (!magasinCode) {
    return NextResponse.json({ error: "magasin requis" }, { status: 400, headers: CORS_HEADERS });
  }

  const isTestMagasin = isTestMagasinCode(magasinCode);

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
  if (!isTestMagasin && (magErr || !magasinId)) {
    return NextResponse.json({ error: magErr ?? "Magasin introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const magasinFilter = isTestMagasin ? undefined : magasinId ?? undefined;

  const [passer, actives, aPreparer, enPreparation] = await Promise.all([
    listCommandesClient(supabase, {
      workflowStatus: "a_passer_caisse",
      magasinId: magasinFilter,
    }),
    listCommandesClient(supabase, {
      workflowStatus: CAISSE_ACTIVE_STATUSES,
      magasinId: magasinFilter,
    }),
    listCommandesClient(supabase, {
      workflowStatus: "a_preparer",
      magasinId: magasinFilter,
    }),
    listCommandesClient(supabase, {
      workflowStatus: "en_preparation",
      magasinId: magasinFilter,
    }),
  ]);

  if (passer.error) {
    return NextResponse.json({ error: passer.error }, { status: 500, headers: CORS_HEADERS });
  }
  if (actives.error) {
    return NextResponse.json({ error: actives.error }, { status: 500, headers: CORS_HEADERS });
  }
  if (aPreparer.error) {
    return NextResponse.json({ error: aPreparer.error }, { status: 500, headers: CORS_HEADERS });
  }
  if (enPreparation.error) {
    return NextResponse.json({ error: enPreparation.error }, { status: 500, headers: CORS_HEADERS });
  }

  const commandes = await mapCommandes(supabase, passer.items, magasinCode, caisseCode);
  const enCours = await mapCommandes(supabase, actives.items, magasinCode, caisseCode);
  const aPreparerList = await mapCommandes(supabase, aPreparer.items, magasinCode, caisseCode);
  const enPreparationList = await mapCommandes(supabase, enPreparation.items, magasinCode, caisseCode);

  return NextResponse.json(
    {
      ok: true,
      commandes,
      enCours,
      aPreparer: aPreparerList,
      enPreparation: enPreparationList,
      isTestMagasin,
    },
    { headers: CORS_HEADERS },
  );
}
