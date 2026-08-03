import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parseIsoDate, userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import type { SalarieEvenementKind } from "@/lib/salaries/types";

type Ctx = { params: Promise<{ id: string }> };

function parseKind(value: unknown): SalarieEvenementKind | null {
  if (value === "malade" || value === "conge" || value === "autre") return value;
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

  const { data, error } = await supabase
    .from("salarie_evenement")
    .select("id, salarie_id, kind, date_debut, date_fin, commentaire, created_at")
    .eq("salarie_id", id)
    .order("date_debut", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evenements: data ?? [] });
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
  const dateDebut = parseIsoDate(b.date_debut);
  const dateFin = parseIsoDate(b.date_fin);
  if (!kind) return NextResponse.json({ error: "kind invalide" }, { status: 400 });
  if (!dateDebut) return NextResponse.json({ error: "date_debut invalide" }, { status: 400 });
  if (!dateFin) return NextResponse.json({ error: "date_fin invalide" }, { status: 400 });
  if (dateFin < dateDebut) {
    return NextResponse.json({ error: "date_fin doit être >= date_debut" }, { status: 400 });
  }

  const commentaire = typeof b.commentaire === "string" ? b.commentaire.trim() || null : null;

  const { data, error } = await supabase
    .from("salarie_evenement")
    .insert({
      salarie_id: id,
      kind,
      date_debut: dateDebut,
      date_fin: dateFin,
      commentaire,
      created_by: gate.userId,
    })
    .select("id, salarie_id, kind, date_debut, date_fin, commentaire, created_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Création impossible" }, { status: 500 });
  }

  return NextResponse.json({ evenement: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  const b = body as Record<string, unknown>;
  const evenementId = typeof b.evenementId === "string" ? b.evenementId : "";
  if (!evenementId) return NextResponse.json({ error: "evenementId requis" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const patch: Record<string, unknown> = {};
  if (b.kind !== undefined) {
    const kind = parseKind(b.kind);
    if (!kind) return NextResponse.json({ error: "kind invalide" }, { status: 400 });
    patch.kind = kind;
  }
  if (b.date_debut !== undefined) {
    const d = parseIsoDate(b.date_debut);
    if (!d) return NextResponse.json({ error: "date_debut invalide" }, { status: 400 });
    patch.date_debut = d;
  }
  if (b.date_fin !== undefined) {
    const d = parseIsoDate(b.date_fin);
    if (!d) return NextResponse.json({ error: "date_fin invalide" }, { status: 400 });
    patch.date_fin = d;
  }
  if (b.commentaire !== undefined) {
    patch.commentaire = typeof b.commentaire === "string" ? b.commentaire.trim() || null : null;
  }

  const { data, error } = await supabase
    .from("salarie_evenement")
    .update(patch)
    .eq("id", evenementId)
    .eq("salarie_id", id)
    .select("id, salarie_id, kind, date_debut, date_fin, commentaire, created_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Mise à jour impossible" }, { status: 500 });
  }

  return NextResponse.json({ evenement: data });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
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
  const evenementId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { evenementId?: unknown }).evenementId === "string"
      ? (body as { evenementId: string }).evenementId
      : "";
  if (!evenementId) {
    return NextResponse.json({ error: "evenementId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error } = await supabase
    .from("salarie_evenement")
    .delete()
    .eq("id", evenementId)
    .eq("salarie_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
