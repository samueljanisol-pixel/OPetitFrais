import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientPrepare } from "@/lib/commandes-client/api-auth";
import {
  applyLinePreparationStatus,
  parseWorkflowLines,
  type LinePreparationStatus,
} from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string; lineKey: string }> };

function decodeLineKey(lineKey: string): { productId: string; shopOrderUnitId: string } | null {
  const decoded = decodeURIComponent(lineKey);
  const parts = decoded.split("__");
  if (parts.length < 2) return null;
  const productId = parts[0]?.trim();
  const unitPart = parts.slice(1).join("__");
  if (!productId) return null;
  return {
    productId,
    shopOrderUnitId: unitPart === "default" ? "" : unitPart,
  };
}

function parseLinePreparationStatus(value: unknown): LinePreparationStatus | null {
  if (value === "available" || value === "unavailable" || value === "unchecked") return value;
  if (value === true) return "available";
  if (value === false) return "unchecked";
  return null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientPrepare();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id, lineKey } = await params;
  let body: { status?: unknown; prepared?: unknown };
  try {
    body = (await req.json()) as { status?: unknown; prepared?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const lineStatus = parseLinePreparationStatus(body.status ?? body.prepared);
  if (lineStatus == null) {
    return NextResponse.json({ error: "Statut ligne invalide" }, { status: 400 });
  }

  const parsed = decodeLineKey(lineKey);
  if (!parsed) {
    return NextResponse.json({ error: "lineKey invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.workflow_status !== "en_preparation") {
    return NextResponse.json({ error: "Préparation non disponible" }, { status: 409 });
  }

  const lines = parseWorkflowLines(row.lines);
  let found = false;
  const updated = lines.map((line) => {
    const unitId = line.shopOrderUnitId ?? "";
    if (line.productId === parsed.productId && unitId === parsed.shopOrderUnitId) {
      found = true;
      return applyLinePreparationStatus(line, lineStatus);
    }
    return line;
  });

  if (!found) {
    return NextResponse.json({ error: "Ligne introuvable" }, { status: 404 });
  }

  const { error } = await supabase.from("shop_cart").update({ lines: updated }).eq("id", id.trim());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, lines: updated });
}
