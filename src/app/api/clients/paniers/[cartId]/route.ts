import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parsePosPanierLines } from "@/lib/clients/pos-panier-lines";
import { parsePosCaisseInfo } from "@/lib/clients/pos-caisse-display";
import { productDisplayName } from "@/lib/products/product-display-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ cartId: string }> };

type StoredLine = {
  productId?: string;
  qty?: number;
  unitLabel?: string;
  priceAtAdd?: number;
  comment?: string | null;
};

function parseStoredLines(raw: unknown): StoredLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((line): line is StoredLine => line != null && typeof line === "object");
}

async function enrichCommandeLines(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storedLines: StoredLine[],
) {
  const productIds = [
    ...new Set(
      storedLines
        .map((line) => (typeof line.productId === "string" ? line.productId.trim() : ""))
        .filter((productId) => productId.length > 0),
    ),
  ];

  const productLabelById = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products, error: productsErr } = await supabase
      .from("product")
      .select("id, name, name_ar, sales_name, sales_name_ar")
      .in("id", productIds);
    if (productsErr) return { error: productsErr.message as string, lines: null };

    for (const product of products ?? []) {
      if (typeof product.id !== "string") continue;
      productLabelById.set(product.id, productDisplayName(product, "fr"));
    }
  }

  const lines = storedLines.map((line) => {
    const productId = typeof line.productId === "string" ? line.productId.trim() : "";
    const productLabel = productId.length > 0 ? (productLabelById.get(productId) ?? null) : null;
    return { ...line, productLabel };
  });

  return { error: null, lines };
}

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

  const storedLines = parseStoredLines(data.lines);
  const enriched = await enrichCommandeLines(supabase, storedLines);
  if (enriched.error || !enriched.lines) {
    return NextResponse.json({ error: enriched.error ?? "Erreur produits" }, { status: 500 });
  }

  const { data: posLink, error: posLinkErr } = await supabase
    .from("shop_cart_pos_link")
    .select(
      "ticket_ref, ticket_number, caisse_code, total, lines, payments, sold_at, linked_at, magasins ( code, nom )",
    )
    .eq("shop_cart_id", id)
    .maybeSingle();
  if (posLinkErr) return NextResponse.json({ error: posLinkErr.message }, { status: 500 });

  const posCaisse = parsePosCaisseInfo(posLink);

  const cartNumber = Number(data.cart_number);
  const commande = {
    cart_id: String(data.id),
    cart_number: cartNumber,
    label: `Commande #${cartNumber}`,
    montant_total: Number(data.montant_total ?? 0),
    submitted_at: data.submitted_at,
    fulfillment_mode: data.fulfillment_mode,
    payment_method: data.payment_method,
    order_comment: data.order_comment,
    lines: enriched.lines,
  };

  const posTicketRef = posCaisse?.ticket_ref ?? null;

  const posPanier = posTicketRef
    ? {
        ticket_ref: posTicketRef,
        ticket_number:
          typeof posLink?.ticket_number === "number" ? posLink.ticket_number : null,
        magasin_code: posCaisse?.magasin_code ?? null,
        magasin_nom: posCaisse?.magasin_nom ?? null,
        caisse_code: posCaisse?.caisse_code ?? null,
        total: Number(posLink?.total ?? 0),
        lines: parsePosPanierLines(posLink?.lines),
        sold_at:
          (typeof posLink?.sold_at === "string" ? posLink.sold_at : null) ??
          (typeof posLink?.linked_at === "string" ? posLink.linked_at : null),
        has_line_detail: parsePosPanierLines(posLink?.lines).length > 0,
      }
    : null;

  const displaySource = posPanier ? ("pos" as const) : ("commande" as const);

  return NextResponse.json({
    panier: {
      id: String(data.id),
      display_source: displaySource,
      label: posPanier ? `Ticket ${posPanier.ticket_ref}` : `Panier #${cartNumber}`,
      client_id: data.client_id,
      client_name: clientName,
      montant_total: posPanier ? posPanier.total : Number(data.montant_total ?? 0),
      payment_status: data.payment_status,
      paye: data.payment_status === "paid",
      submitted_at: data.submitted_at,
      status: data.status,
      pos: posPanier,
      commande,
    },
  });
}
