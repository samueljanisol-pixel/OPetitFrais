import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { isTestMagasinCode } from "@/lib/caisse/magasin-code";
import { listCommandesClient, resolveMagasinIdByCode } from "@/lib/commandes-client/queries";
import {
  CAISSE_ENCAISSEMENT_STATUSES,
  type WorkflowStatus,
} from "@/lib/commandes-client/workflow";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

function encaissementLabel(status: WorkflowStatus | null): string {
  if (status === "livre_espece_a_encaisser" || status === "retire_espece_a_encaisser") {
    return "Espèce à encaisser";
  }
  if (status === "livre_non_paye") {
    return "Non payé — livraison";
  }
  return "À encaisser";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const magasinCode = (req.nextUrl.searchParams.get("magasin") ?? "").trim();
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

  const { items, error } = await listCommandesClient(supabase, {
    workflowStatus: CAISSE_ENCAISSEMENT_STATUSES,
    magasinId: isTestMagasin ? undefined : magasinId ?? undefined,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500, headers: CORS_HEADERS });
  }

  const commandes = items.map((item) => ({
    cartId: item.id,
    cartNumber: item.cart_number,
    clientId: item.client_id,
    clientName: item.client_nom,
    montant: item.pos_total ?? item.montant_total ?? 0,
    workflowStatus: item.workflow_status,
    encaissementLabel: encaissementLabel(item.workflow_status),
    ticketRef: null as string | null,
  }));

  return NextResponse.json({ ok: true, commandes, isTestMagasin }, { headers: CORS_HEADERS });
}
