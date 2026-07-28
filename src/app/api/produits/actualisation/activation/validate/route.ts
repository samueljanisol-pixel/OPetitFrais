import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { ACTUALISATION_PERMS } from "@/lib/products/actualisation";

type ValidateActivationItem = {
  productId: string;
  active: boolean;
  visible_vitrine: boolean;
};

type Body = {
  items?: ValidateActivationItem[];
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
    const active = Boolean(raw.active);
    const visible_vitrine = Boolean(raw.visible_vitrine);

    const { data: queueRow, error: qErr } = await supabase
      .from("product_actualisation_activation")
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle();
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    if (!queueRow) {
      continue;
    }

    const { error: uErr } = await supabase
      .from("product")
      .update({ active, visible_vitrine })
      .eq("id", productId);
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    const { error: dErr } = await supabase
      .from("product_actualisation_activation")
      .delete()
      .eq("product_id", productId);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    validated += 1;
  }

  return NextResponse.json({ ok: true, validated });
}
