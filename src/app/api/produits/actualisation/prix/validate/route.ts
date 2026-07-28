import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { ACTUALISATION_PERMS } from "@/lib/products/actualisation";
import { insertProductPriceHistoryRow } from "@/lib/products/priceHistory";

type ValidatePrixItem = {
  productId: string;
  price: number;
  margin: number | null;
  visible_vitrine: boolean;
};

type Body = {
  items?: ValidatePrixItem[];
};

export async function POST(req: NextRequest) {
  const gate = await requireAnyApiPermission([...ACTUALISATION_PERMS]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Aucun élément à valider" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  let validated = 0;

  for (const raw of items) {
    const productId = typeof raw.productId === "string" ? raw.productId.trim() : "";
    if (!productId) {
      return NextResponse.json({ error: "productId manquant" }, { status: 400 });
    }
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: `Prix invalide pour ${productId}` }, { status: 400 });
    }
    const margin =
      raw.margin == null || raw.margin === undefined
        ? null
        : Number.isFinite(Number(raw.margin))
          ? Number(raw.margin)
          : null;
    const visible_vitrine = Boolean(raw.visible_vitrine);

    const { data: queueRow, error: qErr } = await supabase
      .from("product_actualisation_prix")
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle();
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    if (!queueRow) {
      continue;
    }

    const { data: prod, error: pErr } = await supabase
      .from("product")
      .select("id, active, cost_purchase, cost_manufacturing, cost_packaging, margin, price")
      .eq("id", productId)
      .maybeSingle();
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    if (!prod) {
      return NextResponse.json({ error: `Produit introuvable (${productId})` }, { status: 404 });
    }

    const wasInactive = !(prod as { active?: boolean }).active;
    const cost_purchase = (prod as { cost_purchase?: number | null }).cost_purchase ?? null;
    const cost_manufacturing =
      (prod as { cost_manufacturing?: number | null }).cost_manufacturing ?? null;
    const cost_packaging = (prod as { cost_packaging?: number | null }).cost_packaging ?? null;

    const update: {
      price: number;
      margin: number | null;
      visible_vitrine: boolean;
      active?: boolean;
    } = {
      price,
      margin,
      visible_vitrine,
    };
    if (wasInactive) {
      update.active = true;
    }

    const { error: uErr } = await supabase.from("product").update(update).eq("id", productId);
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    const { error: hErr } = await insertProductPriceHistoryRow(supabase, {
      product_id: productId,
      price,
      cost_purchase,
      cost_manufacturing,
      cost_packaging,
      margin,
    });
    if (hErr) {
      return NextResponse.json({ error: hErr.message }, { status: 500 });
    }

    const { error: dErr } = await supabase
      .from("product_actualisation_prix")
      .delete()
      .eq("product_id", productId);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    validated += 1;
  }

  return NextResponse.json({ ok: true, validated });
}
