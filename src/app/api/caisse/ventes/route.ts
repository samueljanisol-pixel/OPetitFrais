import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket, CAISSE_API_CORS_HEADERS } from "@/lib/caisse/authorize-caisse-ticket";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { normalizePosCode } from "@/lib/clotures/normalize-codes";
import type { CaisseTicketExport } from "@/lib/clotures/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CAISSE_API_CORS_HEADERS });
}

function asTicket(raw: unknown): CaisseTicketExport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const ticketRef = typeof row.ticketRef === "string" ? row.ticketRef.trim() : "";
  const soldAt = typeof row.soldAt === "string" ? row.soldAt : "";
  const magasinCode = normalizePosCode(typeof row.magasinCode === "string" ? row.magasinCode : "");
  const caisseCode = normalizePosCode(typeof row.caisseCode === "string" ? row.caisseCode : "");
  const total = typeof row.total === "number" && Number.isFinite(row.total) ? row.total : null;
  if (!ticketRef || !soldAt || !magasinCode || !caisseCode || total == null) return null;
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const payments = Array.isArray(row.payments) ? row.payments : [];
  return {
    ticketRef,
    ticketNumber:
      typeof row.ticketNumber === "number" && Number.isFinite(row.ticketNumber) ? row.ticketNumber : 0,
    magasinCode,
    caisseCode,
    soldAt,
    total,
    clientId: typeof row.clientId === "string" ? row.clientId : null,
    clientName: typeof row.clientName === "string" ? row.clientName : null,
    isDelivery: row.isDelivery === true,
    clotureRef: typeof row.clotureRef === "string" && row.clotureRef.trim() ? row.clotureRef.trim() : null,
    caissierId: typeof row.caissierId === "string" && row.caissierId.trim() ? row.caissierId.trim() : null,
    caissierName:
      typeof row.caissierName === "string" && row.caissierName.trim() ? row.caissierName.trim() : null,
    lines: lines as CaisseTicketExport["lines"],
    payments: payments.flatMap((p) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return [];
      const pay = p as Record<string, unknown>;
      const mode = typeof pay.mode === "string" ? pay.mode.trim() : "";
      const amount = typeof pay.amount === "number" && Number.isFinite(pay.amount) ? pay.amount : 0;
      if (!mode) return [];
      return [{ mode, label: typeof pay.label === "string" ? pay.label : mode, amount }];
    }),
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

  const rawTickets = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { tickets?: unknown }).tickets)
      ? (body as { tickets: unknown[] }).tickets
      : [body];
  const tickets = rawTickets.flatMap((row) => {
    const ticket = asTicket(row);
    return ticket ? [ticket] : [];
  });
  if (tickets.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Aucun ticket valide" },
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

  const saved: string[] = [];
  for (const ticket of tickets) {
    const { data, error } = await service
      .from("caisse_ticket")
      .upsert(
        {
          ticket_ref: ticket.ticketRef,
          ticket_number: ticket.ticketNumber,
          magasin_code: ticket.magasinCode,
          caisse_code: ticket.caisseCode,
          sold_at: ticket.soldAt,
          total: ticket.total,
          client_id: ticket.clientId,
          client_name: ticket.clientName,
          is_delivery: ticket.isDelivery,
          cloture_ref: ticket.clotureRef,
          caissier_id: ticket.caissierId,
          caissier_name: ticket.caissierName,
          lines: ticket.lines,
        },
        { onConflict: "ticket_ref" },
      )
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Enregistrement ticket impossible", saved },
        { status: 500, headers: CAISSE_API_CORS_HEADERS },
      );
    }
    const ticketId = data.id as string;
    const { error: delErr } = await service.from("caisse_ticket_payment").delete().eq("ticket_id", ticketId);
    if (delErr) {
      return NextResponse.json(
        { ok: false, error: delErr.message, saved },
        { status: 500, headers: CAISSE_API_CORS_HEADERS },
      );
    }
    if (ticket.payments.length > 0) {
      const { error: payErr } = await service.from("caisse_ticket_payment").insert(
        ticket.payments.map((p) => ({
          ticket_id: ticketId,
          mode: p.mode,
          label: p.label,
          amount: p.amount,
        })),
      );
      if (payErr) {
        return NextResponse.json(
          { ok: false, error: payErr.message, saved },
          { status: 500, headers: CAISSE_API_CORS_HEADERS },
        );
      }
    }
    saved.push(ticket.ticketRef);
  }

  return NextResponse.json({ ok: true, saved }, { headers: CAISSE_API_CORS_HEADERS });
}
