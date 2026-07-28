import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { ACTUALISATION_PERMS, proposedSalePrice } from "@/lib/products/actualisation";

const PRODUCT_SELECT =
  "id, code, name, name_ar, price, cost_purchase, cost_manufacturing, cost_packaging, margin, active, visible_vitrine";

export type ActualisationProduct = {
  id: string;
  code: string | null;
  name: string;
  name_ar: string | null;
  price: number;
  cost_purchase: number | null;
  cost_manufacturing: number | null;
  cost_packaging: number | null;
  margin: number | null;
  active: boolean;
  visible_vitrine: boolean;
};

export type ActualisationPrixItem = {
  product_id: string;
  lot_id: string;
  supplier_id: string;
  new_cost_purchase: number;
  created_at: string;
  product: ActualisationProduct;
  proposed_price: number;
};

export type ActualisationQueueItem = {
  product_id: string;
  lot_id: string;
  supplier_id: string;
  created_at: string;
  product: ActualisationProduct;
};

function asProduct(raw: unknown): ActualisationProduct | null {
  if (raw == null) return null;
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (one == null || typeof one !== "object") return null;
  const p = one as Record<string, unknown>;
  if (typeof p.id !== "string") return null;
  return {
    id: p.id,
    code: typeof p.code === "string" ? p.code : null,
    name: typeof p.name === "string" ? p.name : "",
    name_ar: typeof p.name_ar === "string" ? p.name_ar : null,
    price: Number(p.price) || 0,
    cost_purchase: p.cost_purchase == null ? null : Number(p.cost_purchase),
    cost_manufacturing: p.cost_manufacturing == null ? null : Number(p.cost_manufacturing),
    cost_packaging: p.cost_packaging == null ? null : Number(p.cost_packaging),
    margin: p.margin == null ? null : Number(p.margin),
    active: Boolean(p.active),
    visible_vitrine: Boolean(p.visible_vitrine),
  };
}

export async function GET() {
  const gate = await requireAnyApiPermission([...ACTUALISATION_PERMS]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();

  const [prixRes, actRes, desactRes] = await Promise.all([
    supabase
      .from("product_actualisation_prix")
      .select(`product_id, lot_id, supplier_id, new_cost_purchase, created_at, product(${PRODUCT_SELECT})`)
      .order("created_at", { ascending: true }),
    supabase
      .from("product_actualisation_activation")
      .select(`product_id, lot_id, supplier_id, created_at, product(${PRODUCT_SELECT})`)
      .order("created_at", { ascending: true }),
    supabase
      .from("product_actualisation_desactivation")
      .select(`product_id, lot_id, supplier_id, created_at, product(${PRODUCT_SELECT})`)
      .order("created_at", { ascending: true }),
  ]);

  if (prixRes.error) {
    return NextResponse.json({ error: prixRes.error.message }, { status: 500 });
  }
  if (actRes.error) {
    return NextResponse.json({ error: actRes.error.message }, { status: 500 });
  }
  if (desactRes.error) {
    return NextResponse.json({ error: desactRes.error.message }, { status: 500 });
  }

  const prix: ActualisationPrixItem[] = [];
  for (const row of prixRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const product = asProduct(r.product);
    if (!product) continue;
    prix.push({
      product_id: String(r.product_id),
      lot_id: String(r.lot_id),
      supplier_id: String(r.supplier_id),
      new_cost_purchase: Number(r.new_cost_purchase) || 0,
      created_at: String(r.created_at),
      product,
      proposed_price: proposedSalePrice({
        costPurchase: product.cost_purchase,
        costManufacturing: product.cost_manufacturing,
        costPackaging: product.cost_packaging,
        margin: product.margin,
      }),
    });
  }

  const mapQueue = (rows: unknown[] | null): ActualisationQueueItem[] => {
    const out: ActualisationQueueItem[] = [];
    for (const row of rows ?? []) {
      const r = row as Record<string, unknown>;
      const product = asProduct(r.product);
      if (!product) continue;
      out.push({
        product_id: String(r.product_id),
        lot_id: String(r.lot_id),
        supplier_id: String(r.supplier_id),
        created_at: String(r.created_at),
        product,
      });
    }
    return out;
  };

  return NextResponse.json({
    prix,
    activation: mapQueue(actRes.data),
    desactivation: mapQueue(desactRes.data),
  });
}
