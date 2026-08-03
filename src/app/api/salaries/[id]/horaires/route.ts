import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { parseTime, userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import type { HoraireInput, SalarieHoraireRow } from "@/lib/salaries/types";

type Ctx = { params: Promise<{ id: string }> };

function parseHoraireInput(raw: unknown): HoraireInput | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "horaire invalide" };
  const o = raw as Record<string, unknown>;
  const day = o.day_of_week;
  if (typeof day !== "number" || day < 0 || day > 6 || !Number.isInteger(day)) {
    return { error: "day_of_week invalide" };
  }
  if (o.is_repos === true) {
    return { day_of_week: day, is_repos: true };
  }
  const heureDebut = parseTime(o.heure_debut);
  const heureFin = parseTime(o.heure_fin);
  if (!heureDebut || !heureFin) return { error: "heures invalides" };
  return { day_of_week: day, is_repos: false, heure_debut: heureDebut, heure_fin: heureFin };
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
    .from("salarie_horaire")
    .select("id, salarie_id, day_of_week, is_repos, heure_debut, heure_fin")
    .eq("salarie_id", id)
    .order("day_of_week", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ horaires: (data ?? []) as SalarieHoraireRow[] });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
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

  const horairesRaw =
    typeof body === "object" && body !== null && Array.isArray((body as { horaires?: unknown }).horaires)
      ? (body as { horaires: unknown[] }).horaires
      : null;
  if (!horairesRaw) {
    return NextResponse.json({ error: "horaires[] requis" }, { status: 400 });
  }

  const parsed: HoraireInput[] = [];
  for (const raw of horairesRaw) {
    const item = parseHoraireInput(raw);
    if ("error" in item) return NextResponse.json({ error: item.error }, { status: 400 });
    parsed.push(item);
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error: delErr } = await supabase.from("salarie_horaire").delete().eq("salarie_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (parsed.length === 0) {
    return NextResponse.json({ horaires: [] });
  }

  const rows = parsed.map((h) =>
    h.is_repos
      ? {
          salarie_id: id,
          day_of_week: h.day_of_week,
          is_repos: true,
          heure_debut: null,
          heure_fin: null,
        }
      : {
          salarie_id: id,
          day_of_week: h.day_of_week,
          is_repos: false,
          heure_debut: h.heure_debut,
          heure_fin: h.heure_fin,
        },
  );

  const { data, error } = await supabase
    .from("salarie_horaire")
    .insert(rows)
    .select("id, salarie_id, day_of_week, is_repos, heure_debut, heure_fin");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ horaires: (data ?? []) as SalarieHoraireRow[] });
}
