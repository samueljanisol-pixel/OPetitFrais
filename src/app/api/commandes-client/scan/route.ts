import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientDeliver } from "@/lib/commandes-client/api-auth";
import {
  findCommandeByCartNumber,
  findCommandeByTicketRef,
  getCommandeClientListItem,
} from "@/lib/commandes-client/queries";
import { parseDeliverySearchQuery, transitionWorkflowStatus } from "@/lib/commandes-client/workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  ticketRef?: string;
  query?: string;
  lookupOnly?: boolean;
};

async function resolveShopCartId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  raw: string,
): Promise<{ shopCartId: string | null; error: string | null; invalid?: boolean }> {
  const parsed = parseDeliverySearchQuery(raw);
  if (!parsed) {
    return { shopCartId: null, error: "Saisie invalide", invalid: true };
  }

  if (parsed.kind === "ticket") {
    const { shopCartId, error } = await findCommandeByTicketRef(supabase, parsed.ticketRef);
    return { shopCartId, error };
  }

  return findCommandeByCartNumber(supabase, parsed.cartNumber);
}

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

  const rawQuery =
    typeof body.query === "string" && body.query.trim().length > 0
      ? body.query.trim()
      : typeof body.ticketRef === "string"
        ? body.ticketRef.trim()
        : "";
  const lookupOnly = body.lookupOnly === true;

  if (!rawQuery) {
    return NextResponse.json({ error: "Recherche vide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const resolved = await resolveShopCartId(supabase, rawQuery);
  if (resolved.invalid) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: 500 });
  if (!resolved.shopCartId) {
    return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  }

  const shopCartId = resolved.shopCartId;

  const { data: cart, error: ce } = await supabase
    .from("shop_cart")
    .select("id, workflow_status")
    .eq("id", shopCartId)
    .maybeSingle();

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  if (!cart) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  const workflowStatus = String(cart.workflow_status);

  if (lookupOnly) {
    if (workflowStatus !== "a_livrer" && workflowStatus !== "en_livraison") {
      return NextResponse.json({ error: "Commande non disponible pour livraison" }, { status: 409 });
    }
  } else if (workflowStatus === "a_livrer") {
    const now = new Date().toISOString();
    const result = await transitionWorkflowStatus(supabase, {
      shopCartId,
      fromStatus: "a_livrer",
      toStatus: "en_livraison",
      actorUserId: gate.userId,
      comment: rawQuery,
      extraPatch: { delivery_started_at: now },
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
    }
  } else if (workflowStatus !== "en_livraison") {
    return NextResponse.json({ error: "Commande non disponible pour livraison" }, { status: 409 });
  }

  const { item, error: itemErr } = await getCommandeClientListItem(supabase, shopCartId);
  if (itemErr) return NextResponse.json({ error: itemErr }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    shopCartId,
    workflow_status: item.workflow_status,
    commande: item,
  });
}
