import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientDeliver } from "@/lib/commandes-client/api-auth";
import { transitionWorkflowStatus, type ConfirmedPaymentMethod } from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

type Body = {
  payment?: ConfirmedPaymentMethod;
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientDeliver();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  let body: Body = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.workflow_status !== "a_retirer") {
    return NextResponse.json({ error: "Retrait non disponible" }, { status: 409 });
  }

  const now = new Date().toISOString();
  let toStatus: "retire_paye" | "retire_espece_a_encaisser" | "retire_compte_client";
  let paymentStatus = row.payment_status;
  let confirmedPayment: ConfirmedPaymentMethod | null = null;

  if (row.payment_status === "paid") {
    toStatus = "retire_paye";
  } else {
    const payment = body.payment;
    if (payment === "card") {
      toStatus = "retire_paye";
      paymentStatus = "paid";
      confirmedPayment = "card";
    } else if (payment === "cash") {
      toStatus = "retire_espece_a_encaisser";
      confirmedPayment = "cash";
    } else if (payment === "credit") {
      if (!row.client_id) {
        return NextResponse.json({ error: "Client requis pour compte client" }, { status: 400 });
      }
      toStatus = "retire_compte_client";
      paymentStatus = "unpaid";
      confirmedPayment = "credit";
    } else {
      return NextResponse.json({ error: "Mode paiement requis" }, { status: 400 });
    }
  }

  const extraPatch: Record<string, unknown> = {
    delivered_at: now,
    delivered_by: gate.userId,
    payment_status: paymentStatus,
  };
  if (confirmedPayment) extraPatch.confirmed_payment_method = confirmedPayment;

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: id.trim(),
    fromStatus: "a_retirer",
    toStatus,
    actorUserId: gate.userId,
    extraPatch,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, workflow_status: toStatus, payment_status: paymentStatus });
}
