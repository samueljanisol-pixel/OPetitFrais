import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parseIsoDate, userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import { loadPaiementsForSalarie } from "@/lib/salaries/queries";
import type { SalariePaiementKind } from "@/lib/salaries/types";

type Ctx = { params: Promise<{ id: string }> };

function parseKind(value: unknown): SalariePaiementKind | null {
  if (value === "salaire" || value === "avance") return value;
  return null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("salaries.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const result = await loadPaiementsForSalarie(supabase, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ paiements: result.paiements, summary: result.summary });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("salaries.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const b = body as Record<string, unknown>;
  const kind = parseKind(b.kind);
  const datePaiement = parseIsoDate(b.date_paiement);
  const montantRaw = b.montant;
  const montant =
    typeof montantRaw === "number"
      ? montantRaw
      : typeof montantRaw === "string"
        ? Number(montantRaw)
        : NaN;

  if (!kind) return NextResponse.json({ error: "kind invalide" }, { status: 400 });
  if (!datePaiement) return NextResponse.json({ error: "date_paiement invalide" }, { status: 400 });
  if (!Number.isFinite(montant) || montant <= 0) {
    return NextResponse.json({ error: "montant invalide" }, { status: 400 });
  }

  const paymentMethodId =
    typeof b.payment_method_id === "string" && b.payment_method_id.length > 0
      ? b.payment_method_id
      : null;
  const commentaire = typeof b.commentaire === "string" ? b.commentaire.trim() || null : null;

  const { data, error } = await supabase
    .from("salarie_paiement")
    .insert({
      salarie_id: id,
      kind,
      montant,
      date_paiement: datePaiement,
      payment_method_id: paymentMethodId,
      commentaire,
      created_by: gate.userId,
    })
    .select("id, salarie_id, kind, montant, date_paiement, payment_method_id, commentaire, created_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Création impossible" }, { status: 500 });
  }

  return NextResponse.json({ paiement: data }, { status: 201 });
}
