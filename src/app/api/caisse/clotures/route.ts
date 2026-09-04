import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket, CAISSE_API_CORS_HEADERS } from "@/lib/caisse/authorize-caisse-ticket";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { emptyClotureSnapshot } from "@opf/caisse-core";
import { normalizePosCode } from "@/lib/clotures/normalize-codes";
import type { CaisseClotureExport, CloturePaymentBreakdown } from "@/lib/clotures/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CAISSE_API_CORS_HEADERS });
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asSnapshotPayments(raw: unknown): CloturePaymentBreakdown[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as Record<string, unknown>;
    const mode = typeof item.mode === "string" ? item.mode.trim() : "";
    if (!mode) return [];
    return [
      {
        mode,
        label: typeof item.label === "string" ? item.label : mode,
        amount: asFiniteNumber(item.amount) ?? 0,
        ticketCount: Math.max(0, Math.round(asFiniteNumber(item.ticketCount) ?? 0)),
        creditSettlement: asFiniteNumber(item.creditSettlement) ?? 0,
      },
    ];
  });
}

function asCloture(raw: unknown): CaisseClotureExport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const clotureRef = typeof row.clotureRef === "string" ? row.clotureRef.trim() : "";
  const magasinCode = normalizePosCode(typeof row.magasinCode === "string" ? row.magasinCode : "");
  const caisseCode = normalizePosCode(typeof row.caisseCode === "string" ? row.caisseCode : "");
  const openedAt = typeof row.openedAt === "string" ? row.openedAt : "";
  const closedAt = typeof row.closedAt === "string" ? row.closedAt : "";
  if (!clotureRef || !magasinCode || !caisseCode || !openedAt || !closedAt) return null;
  const snapRaw =
    row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
      ? (row.snapshot as Record<string, unknown>)
      : {};
  const empty = emptyClotureSnapshot();
  return {
    clotureRef,
    clotureNumber: Math.max(0, Math.round(asFiniteNumber(row.clotureNumber) ?? 0)),
    magasinCode,
    caisseCode,
    caissierId: typeof row.caissierId === "string" ? row.caissierId : "",
    caissierName: typeof row.caissierName === "string" ? row.caissierName : "",
    openedAt,
    closedAt,
    bills50: Math.max(0, Math.round(asFiniteNumber(row.bills50) ?? 0)),
    bills20: Math.max(0, Math.round(asFiniteNumber(row.bills20) ?? 0)),
    coins10: Math.max(0, Math.round(asFiniteNumber(row.coins10) ?? 0)),
    drawerTotal: asFiniteNumber(row.drawerTotal) ?? 0,
    snapshot: {
      saleTotal: asFiniteNumber(snapRaw.saleTotal) ?? empty.saleTotal,
      creditSaleTotal: asFiniteNumber(snapRaw.creditSaleTotal) ?? empty.creditSaleTotal,
      saleCount: Math.max(0, Math.round(asFiniteNumber(snapRaw.saleCount) ?? 0)),
      averageBasket: asFiniteNumber(snapRaw.averageBasket) ?? empty.averageBasket,
      deliveryTotal: asFiniteNumber(snapRaw.deliveryTotal) ?? empty.deliveryTotal,
      settlementTotal: asFiniteNumber(snapRaw.settlementTotal) ?? empty.settlementTotal,
      creditSettlementTotal: asFiniteNumber(snapRaw.creditSettlementTotal) ?? 0,
      payments: asSnapshotPayments(snapRaw.payments),
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalide" },
      { status: 400, headers: CAISSE_API_CORS_HEADERS },
    );
  }

  const cloture = asCloture(
    body && typeof body === "object" && !Array.isArray(body) && "cloture" in body
      ? (body as { cloture: unknown }).cloture
      : body,
  );
  if (!cloture) {
    return NextResponse.json(
      { ok: false, error: "Clôture invalide" },
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

  const { data: existing } = await service
    .from("caisse_cloture")
    .select("status")
    .eq("cloture_ref", cloture.clotureRef)
    .maybeSingle();
  const keepStatus = existing?.status === "verifiee" ? "verifiee" : "a_verifier";

  const { error } = await service.from("caisse_cloture").upsert(
    {
      cloture_ref: cloture.clotureRef,
      cloture_number: cloture.clotureNumber,
      magasin_code: cloture.magasinCode,
      caisse_code: cloture.caisseCode,
      caissier_id: cloture.caissierId,
      caissier_name: cloture.caissierName,
      opened_at: cloture.openedAt,
      closed_at: cloture.closedAt,
      bills50: cloture.bills50,
      bills20: cloture.bills20,
      coins10: cloture.coins10,
      drawer_total: cloture.drawerTotal,
      sale_total: cloture.snapshot.saleTotal,
      credit_sale_total: cloture.snapshot.creditSaleTotal,
      sale_count: cloture.snapshot.saleCount,
      average_basket: cloture.snapshot.averageBasket,
      delivery_total: cloture.snapshot.deliveryTotal,
      settlement_total: cloture.snapshot.settlementTotal,
      credit_settlement_total: cloture.snapshot.creditSettlementTotal,
      payments: cloture.snapshot.payments,
      status: keepStatus,
    },
    { onConflict: "cloture_ref" },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: CAISSE_API_CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, clotureRef: cloture.clotureRef }, { headers: CAISSE_API_CORS_HEADERS });
}
