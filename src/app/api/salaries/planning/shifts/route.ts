import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parseIsoDate, parseTime, userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import { mondayOfWeek } from "@/lib/salaries/planning";
import type { SalariePlanningKind } from "@/lib/salaries/types";

function parseKind(value: unknown): SalariePlanningKind | null {
  if (value === "travail" || value === "repos" || value === "malade" || value === "conge") return value;
  return null;
}

export async function POST(req: NextRequest) {
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
  const salarieId = typeof b.salarie_id === "string" ? b.salarie_id : "";
  const semaineRaw = parseIsoDate(b.semaine);
  const dayOfWeek = b.day_of_week;
  const kind = parseKind(b.kind);

  if (!salarieId) return NextResponse.json({ error: "salarie_id requis" }, { status: 400 });
  if (!semaineRaw) return NextResponse.json({ error: "semaine invalide" }, { status: 400 });
  if (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6 || !Number.isInteger(dayOfWeek)) {
    return NextResponse.json({ error: "day_of_week invalide" }, { status: 400 });
  }
  if (!kind) return NextResponse.json({ error: "kind invalide" }, { status: 400 });

  const semaine = mondayOfWeek(semaineRaw);
  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, salarieId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let heureDebut: string | null = null;
  let heureFin: string | null = null;
  if (kind === "travail") {
    heureDebut = parseTime(b.heure_debut);
    heureFin = parseTime(b.heure_fin);
    if (!heureDebut || !heureFin) {
      return NextResponse.json({ error: "heures requises pour travail" }, { status: 400 });
    }
  }

  const row = {
    salarie_id: salarieId,
    semaine,
    day_of_week: dayOfWeek,
    kind,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    created_by: gate.userId,
  };

  const { data, error } = await supabase
    .from("salarie_planning_shift")
    .upsert(row, { onConflict: "salarie_id,semaine,day_of_week" })
    .select("id, salarie_id, semaine, day_of_week, kind, heure_debut, heure_fin")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Enregistrement impossible" }, { status: 500 });
  }

  return NextResponse.json({ shift: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
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

  const shiftId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { shiftId?: unknown }).shiftId === "string"
      ? (body as { shiftId: string }).shiftId
      : "";
  if (!shiftId) {
    return NextResponse.json({ error: "shiftId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: shift, error: fe } = await supabase
    .from("salarie_planning_shift")
    .select("id, salarie_id")
    .eq("id", shiftId)
    .maybeSingle();

  if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
  if (!shift) return NextResponse.json({ error: "Shift introuvable" }, { status: 404 });

  const access = await userCanAccessSalarie(
    supabase,
    gate.userId,
    String((shift as { salarie_id: string }).salarie_id),
  );
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error } = await supabase.from("salarie_planning_shift").delete().eq("id", shiftId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
