import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientValidate } from "@/lib/commandes-client/api-auth";
import { appendWorkflowLog } from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

type Body = { clientId?: string };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientValidate();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) {
    return NextResponse.json({ error: "clientId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: client, error: ce } = await supabase
    .from("caisse_client")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.status !== "submitted") {
    return NextResponse.json({ error: "Commande non rattachable" }, { status: 400 });
  }

  const fromStatus = row.workflow_status ?? "nouvelle";
  const toStatus = fromStatus === "nouvelle" ? "a_valider" : fromStatus;

  const { error: updErr } = await supabase
    .from("shop_cart")
    .update({
      client_id: clientId,
      workflow_status: toStatus,
    })
    .eq("id", id.trim());

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await appendWorkflowLog(supabase, {
    shopCartId: id.trim(),
    fromStatus: fromStatus === "nouvelle" ? "nouvelle" : fromStatus,
    toStatus,
    action: fromStatus === "nouvelle" ? "transition" : "transition",
    actorUserId: gate.userId,
    comment: fromStatus === "nouvelle" ? "Rattachement client" : "Mise à jour client",
  });

  return NextResponse.json({ ok: true, workflow_status: toStatus });
}
