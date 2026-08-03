import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ cartId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const gate = await requireApiPermission("clients.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { cartId } = await params;
  const id = cartId.trim();
  if (!id) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shop_cart")
    .select(
      "id, cart_number, client_id, montant_total, payment_status, submitted_at, fulfillment_mode, payment_method, order_comment, lines, status, caisse_client(id, nom)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Panier introuvable" }, { status: 404 });

  const clientRaw = data.caisse_client;
  const clientRow = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
  const clientName =
    clientRow && typeof (clientRow as { nom?: string }).nom === "string"
      ? (clientRow as { nom: string }).nom.trim()
      : null;

  return NextResponse.json({
    panier: {
      id: String(data.id),
      cart_number: Number(data.cart_number),
      label: `Panier #${data.cart_number}`,
      client_id: data.client_id,
      client_name: clientName,
      montant_total: Number(data.montant_total ?? 0),
      payment_status: data.payment_status,
      paye: data.payment_status === "paid",
      submitted_at: data.submitted_at,
      fulfillment_mode: data.fulfillment_mode,
      payment_method: data.payment_method,
      order_comment: data.order_comment,
      lines: data.lines,
      status: data.status,
    },
  });
}
