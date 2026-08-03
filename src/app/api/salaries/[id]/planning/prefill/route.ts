import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import { mondayOfWeek } from "@/lib/salaries/planning";
import { parseIsoDate } from "@/lib/salaries/api-helpers";

type Ctx = { params: Promise<{ id: string }> };

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

  const semaineRaw =
    typeof body === "object" && body !== null && typeof (body as { semaine?: unknown }).semaine === "string"
      ? parseIsoDate((body as { semaine: string }).semaine)
      : null;
  if (!semaineRaw) {
    return NextResponse.json({ error: "semaine invalide" }, { status: 400 });
  }

  const semaine = mondayOfWeek(semaineRaw);
  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data: horaires, error: hErr } = await supabase
    .from("salarie_horaire")
    .select("day_of_week, is_repos, heure_debut, heure_fin")
    .eq("salarie_id", id);

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

  const rows = (horaires ?? []).map((raw) => {
    const h = raw as {
      day_of_week: number;
      is_repos: boolean;
      heure_debut: string | null;
      heure_fin: string | null;
    };
    if (h.is_repos) {
      return {
        salarie_id: id,
        semaine,
        day_of_week: h.day_of_week,
        kind: "repos" as const,
        heure_debut: null,
        heure_fin: null,
        created_by: gate.userId,
      };
    }
    return {
      salarie_id: id,
      semaine,
      day_of_week: h.day_of_week,
      kind: "travail" as const,
      heure_debut: h.heure_debut,
      heure_fin: h.heure_fin,
      created_by: gate.userId,
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ shifts: [], message: "Aucun horaire récurrent défini" });
  }

  const { data, error } = await supabase
    .from("salarie_planning_shift")
    .upsert(rows, { onConflict: "salarie_id,semaine,day_of_week" })
    .select("id, salarie_id, semaine, day_of_week, kind, heure_debut, heure_fin");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shifts: data ?? [] });
}
