import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientDeliver } from "@/lib/commandes-client/api-auth";
import { findCommandeByTicketRef } from "@/lib/commandes-client/queries";
import { parseTicketReference, transitionWorkflowStatus } from "@/lib/commandes-client/workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = { ticketRef?: string };

export async function POST(req: NextRequest) {
  const gate = await requireCommandesClientDeliver();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const ticketRef = typeof body.ticketRef === "string" ? body.ticketRef.trim() : "";
  if (!ticketRef || !parseTicketReference(ticketRef)) {
    return NextResponse.json({ error: "ticketRef invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { shopCartId, error: findErr } = await findCommandeByTicketRef(supabase, ticketRef);
  if (findErr) return NextResponse.json({ error: findErr }, { status: 500 });
  if (!shopCartId) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  const { data: cart, error: ce } = await supabase
    .from("shop_cart")
    .select("id, workflow_status")
    .eq("id", shopCartId)
    .maybeSingle();

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  if (!cart) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  if (String(cart.workflow_status) !== "a_livrer") {
    return NextResponse.json({ error: "Commande non disponible pour livraison" }, { status: 409 });
  }

  const now = new Date().toISOString();
  await supabase
    .from("shop_cart")
    .update({ delivery_started_at: now })
    .eq("id", shopCartId);

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId,
    fromStatus: "a_livrer",
    toStatus: "en_livraison",
    actorUserId: gate.userId,
    comment: ticketRef,
    extraPatch: { delivery_started_at: now },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, shopCartId, workflow_status: "en_livraison" });
}
