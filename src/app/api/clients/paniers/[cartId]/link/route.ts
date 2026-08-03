import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ cartId: string }> };

type PatchBody = {
  clientId?: string;
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const gate = await requireApiPermission("clients.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { cartId } = await params;
  const id = cartId.trim();
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
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

  const { data: cart, error: fe } = await supabase
    .from("shop_cart")
    .select("id, status, client_id, workflow_status")
    .eq("id", id)
    .maybeSingle();

  if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
  if (!cart) return NextResponse.json({ error: "Panier introuvable" }, { status: 404 });
  if (String(cart.status) !== "submitted") {
    return NextResponse.json({ error: "Seuls les paniers soumis peuvent être rattachés" }, { status: 400 });
  }
  if (cart.client_id != null) {
    return NextResponse.json({ error: "Panier déjà rattaché à un client" }, { status: 409 });
  }

  const currentWs = (cart as { workflow_status?: string | null }).workflow_status;
  const workflowStatus =
    currentWs == null || currentWs === "nouvelle" ? "a_valider" : currentWs;

  const { data, error } = await supabase
    .from("shop_cart")
    .update({
      client_id: clientId,
      workflow_status: workflowStatus,
    })
    .eq("id", id)
    .select("id, cart_number, client_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });

  return NextResponse.json({
    ok: true,
    panier: {
      id: String(data.id),
      cart_number: Number(data.cart_number),
      client_id: data.client_id,
    },
  });
}
