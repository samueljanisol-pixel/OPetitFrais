import { NextRequest, NextResponse } from "next/server";
import { authorizeCaisseTicket } from "@/lib/caisse/authorize-caisse-ticket";
import { buildShopPreparationTicketEscPos } from "@/lib/caisse/shop-preparation-ticket";
import { groupWorkflowLinesByCategory } from "@/lib/commandes-client/group-workflow-lines-by-category";
import { parseWorkflowLines } from "@/lib/commandes-client/workflow";
import { getCommandeClientDetail } from "@/lib/commandes-client/queries";
import { productDisplayName } from "@/lib/products/product-display-name";
import { loadShopProductsByIds } from "@/lib/shop/load-shop-catalog";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, x-caisse-ticket-token, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const auth = authorizeCaisseTicket(req);
  if (!auth.ok) return auth.response;

  const cartId = (req.nextUrl.searchParams.get("cartId") ?? "").trim();
  if (!cartId) {
    return NextResponse.json({ error: "cartId requis" }, { status: 400, headers: CORS_HEADERS });
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase indisponible" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const { item, error } = await getCommandeClientDetail(supabase, cartId);
  if (error || !item) {
    return NextResponse.json({ error: error ?? "Commande introuvable" }, { status: 404, headers: CORS_HEADERS });
  }

  const status = item.workflow_status;
  if (status !== "a_preparer" && status !== "en_preparation") {
    return NextResponse.json(
      { error: "Impression préparation indisponible pour ce statut" },
      { status: 409, headers: CORS_HEADERS },
    );
  }

  const lines = parseWorkflowLines(item.lines);
  const productIds = lines.map((line) => line.productId);
  const locale = "fr" as const;
  const { products, categories, error: catalogErr } = await loadShopProductsByIds(productIds, locale);
  if (catalogErr) {
    return NextResponse.json({ error: catalogErr }, { status: 500, headers: CORS_HEADERS });
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const categoryMeta = new Map(categories.map((c) => [c.id, { label: c.label, sortOrder: c.sortOrder }]));
  const groups = groupWorkflowLinesByCategory(
    lines,
    productById,
    categoryMeta,
    "Divers",
    locale,
  );

  const bytes = buildShopPreparationTicketEscPos({
    cartNumber: item.cart_number,
    clientName: item.client_nom,
    fulfillmentMode: item.fulfillment_mode,
    magasinNom: item.magasin_nom,
    orderComment: item.order_comment,
    groups: groups.map((group) => ({
      categoryLabel: group.categoryLabel,
      lines: group.items.map((line) => {
        const product = productById.get(line.productId);
        return {
          qty: line.qty,
          productName: product ? productDisplayName(product, locale) : line.productId.slice(0, 12),
          unitLabel: line.unitLabel ?? null,
          unitCode: line.unitCode ?? null,
          comment: line.comment ?? null,
        };
      }),
    })),
  });

  const encode = req.nextUrl.searchParams.get("encode")?.trim();
  if (encode === "base64") {
    return NextResponse.json(
      { ok: true, base64: Buffer.from(bytes).toString("base64") },
      { headers: CORS_HEADERS },
    );
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/octet-stream",
    },
  });
}
