import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientReadAccess, requireCommandesClientValidate } from "@/lib/commandes-client/api-auth";
import { getCommandeClientDetail, listWorkflowLog, loadShopCartRow } from "@/lib/commandes-client/queries";
import { parseWorkflowLines, totalFromStoredLines } from "@/lib/commandes-client/workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

type PatchBody = {
  fulfillment_mode?: "pickup" | "home" | null;
  payment_method?: "cash" | "card" | null;
  order_comment?: string | null;
  magasin_id?: string | null;
  lines?: Array<{
    productId: string;
    shopOrderUnitId?: string;
    qty: number;
    unitCode?: string;
    unitLabel?: string;
    priceAtAdd: number;
    equivKgAtAdd?: number;
    canonicalKg?: number | null;
    comment?: string | null;
  }>;
};

export async function GET(_req: Request, { params }: RouteParams) {
  const gate = await requireCommandesClientReadAccess();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { item, error } = await getCommandeClientDetail(supabase, id.trim());
  if (error) {
    const status = error === "Commande introuvable" ? 404 : 500;
    return NextResponse.json({ error }, { status });
  }

  const { entries: log } = await listWorkflowLog(supabase, id.trim(), 30);
  return NextResponse.json({ commande: item, log });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientValidate();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.status !== "submitted") {
    return NextResponse.json({ error: "Commande non éditable" }, { status: 400 });
  }
  const ws = row.workflow_status;
  if (ws !== "nouvelle" && ws !== "a_valider" && ws !== "a_preparer" && ws !== "en_preparation") {
    return NextResponse.json({ error: "Commande non éditable à cette étape" }, { status: 409 });
  }
  const canEditLines = ws === "nouvelle" || ws === "a_valider";

  const patch: Record<string, unknown> = {};
  if (body.fulfillment_mode !== undefined) patch.fulfillment_mode = body.fulfillment_mode;
  if (body.payment_method !== undefined) patch.payment_method = body.payment_method;
  if (body.order_comment !== undefined) patch.order_comment = body.order_comment?.trim() || null;
  if (body.magasin_id !== undefined) patch.magasin_id = body.magasin_id || null;

  if (body.lines != null) {
    if (!canEditLines) {
      return NextResponse.json({ error: "Lignes non modifiables à cette étape" }, { status: 409 });
    }
    const existing = parseWorkflowLines(row.lines);
    const prepStateByKey = new Map<
      string,
      { prepared: boolean; preparedAt: string | null; unavailable: boolean; unavailableAt: string | null }
    >();
    for (const line of existing) {
      const key = `${line.productId}__${line.shopOrderUnitId ?? "default"}`;
      prepStateByKey.set(key, {
        prepared: line.prepared === true,
        preparedAt: line.preparedAt ?? null,
        unavailable: line.unavailable === true,
        unavailableAt: line.unavailableAt ?? null,
      });
    }
    const serialized = body.lines.map((line) => {
      const key = `${line.productId}__${line.shopOrderUnitId ?? "default"}`;
      const prev = prepStateByKey.get(key);
      const prepared = prev?.prepared ?? false;
      const unavailable = prev?.unavailable ?? false;
      return {
        ...line,
        comment: line.comment?.trim() || null,
        prepared,
        preparedAt: prepared ? prev?.preparedAt ?? new Date().toISOString() : null,
        unavailable,
        unavailableAt: unavailable ? prev?.unavailableAt ?? new Date().toISOString() : null,
      };
    });
    patch.lines = serialized;
    patch.montant_total = totalFromStoredLines(serialized);
  }

  const { data, error } = await supabase
    .from("shop_cart")
    .update(patch)
    .eq("id", id.trim())
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
