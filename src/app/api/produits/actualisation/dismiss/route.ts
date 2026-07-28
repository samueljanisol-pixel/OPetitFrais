import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import {
  ACTUALISATION_PERMS,
  actualisationQueueTable,
  type ActualisationQueue,
} from "@/lib/products/actualisation";

type Body = {
  queue?: ActualisationQueue;
  productIds?: string[];
};

const QUEUES: ActualisationQueue[] = ["prix", "activation", "desactivation"];

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

  const queue = body.queue;
  if (!queue || !QUEUES.includes(queue)) {
    return NextResponse.json({ error: "queue invalide" }, { status: 400 });
  }

  const productIds = Array.isArray(body.productIds)
    ? body.productIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (productIds.length === 0) {
    return NextResponse.json({ error: "Aucun produit sélectionné" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const table = actualisationQueueTable(queue);
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in("product_id", productIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dismissed: count ?? productIds.length });
}
