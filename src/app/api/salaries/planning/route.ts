import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { requireSalariesSite } from "@/lib/salaries/api-helpers";
import { parseIsoDate } from "@/lib/salaries/api-helpers";
import { mondayOfWeek, todayIsoDate } from "@/lib/salaries/planning";
import type { PlanningSalarieRow, SalarieHoraireRow, SalariePlanningShiftRow } from "@/lib/salaries/types";

export async function GET(req: NextRequest) {
  const gate = await requireApiPermission("salaries.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const magasinId = req.nextUrl.searchParams.get("magasinId") ?? "";
  const semaineRaw = req.nextUrl.searchParams.get("semaine");
  const salarieIdFilter = req.nextUrl.searchParams.get("salarieId");
  const includeDeparted = req.nextUrl.searchParams.get("includeDeparted") === "1";

  if (!magasinId) {
    return NextResponse.json({ error: "magasinId requis" }, { status: 400 });
  }

  const semaine = semaineRaw ? (parseIsoDate(semaineRaw) ? mondayOfWeek(semaineRaw) : null) : mondayOfWeek(todayIsoDate());
  if (!semaine) {
    return NextResponse.json({ error: "semaine invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const siteGate = await requireSalariesSite(magasinId);
  if (!siteGate.ok) {
    return NextResponse.json({ error: siteGate.error }, { status: siteGate.status });
  }

  let salarieQuery = supabase
    .from("salarie")
    .select("id, nom, prenom, date_depart")
    .eq("magasin_id", magasinId)
    .order("nom", { ascending: true })
    .order("prenom", { ascending: true });

  if (!includeDeparted) {
    salarieQuery = salarieQuery.is("date_depart", null);
  }
  if (salarieIdFilter) {
    salarieQuery = salarieQuery.eq("id", salarieIdFilter);
  }

  const { data: salaries, error: sErr } = await salarieQuery;
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const salarieIds = (salaries ?? []).map((s) => String((s as { id: string }).id));
  if (salarieIds.length === 0) {
    return NextResponse.json({ semaine, salaries: [] as PlanningSalarieRow[] });
  }

  const { data: shifts, error: shErr } = await supabase
    .from("salarie_planning_shift")
    .select("id, salarie_id, semaine, day_of_week, kind, heure_debut, heure_fin")
    .eq("semaine", semaine)
    .in("salarie_id", salarieIds);

  if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500 });

  const { data: horaires, error: hErr } = await supabase
    .from("salarie_horaire")
    .select("id, salarie_id, day_of_week, is_repos, heure_debut, heure_fin")
    .in("salarie_id", salarieIds);

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

  const shiftsBySalarie = new Map<string, SalariePlanningShiftRow[]>();
  for (const raw of shifts ?? []) {
    const row = raw as SalariePlanningShiftRow;
    const list = shiftsBySalarie.get(row.salarie_id) ?? [];
    list.push(row);
    shiftsBySalarie.set(row.salarie_id, list);
  }

  const horairesBySalarie = new Map<string, SalarieHoraireRow[]>();
  for (const raw of horaires ?? []) {
    const row = raw as SalarieHoraireRow;
    const list = horairesBySalarie.get(row.salarie_id) ?? [];
    list.push(row);
    horairesBySalarie.set(row.salarie_id, list);
  }

  const result: PlanningSalarieRow[] = (salaries ?? []).map((raw) => {
    const s = raw as { id: string; nom: string | null; prenom: string; date_depart: string | null };
    return {
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      date_depart: s.date_depart,
      shifts: shiftsBySalarie.get(s.id) ?? [],
      horaires: horairesBySalarie.get(s.id) ?? [],
    };
  });

  return NextResponse.json({ semaine, salaries: result });
}
