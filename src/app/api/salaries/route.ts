import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { assertSalariesSiteExists } from "@/lib/salaries/sites";
import { optionalTrimText, parseIsoDate, requireNonEmptyText, requireSalariesSite } from "@/lib/salaries/api-helpers";
import type { SalarieListItem } from "@/lib/salaries/types";

export async function GET(req: NextRequest) {
  const gate = await requireApiPermission("salaries.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const magasinId = req.nextUrl.searchParams.get("magasinId") ?? "";
  const includeDeparted = req.nextUrl.searchParams.get("includeDeparted") === "1";

  if (!magasinId) {
    return NextResponse.json({ error: "magasinId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const siteGate = await requireSalariesSite(magasinId);
  if (!siteGate.ok) {
    return NextResponse.json({ error: siteGate.error }, { status: siteGate.status });
  }

  let query = supabase
    .from("salarie")
    .select(
      "id, magasin_id, nom, prenom, date_arrivee, date_depart, notes, profile_id, created_at, updated_at, magasins(nom, code)",
    )
    .eq("magasin_id", magasinId)
    .order("nom", { ascending: true })
    .order("prenom", { ascending: true });

  if (!includeDeparted) {
    query = query.is("date_depart", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const salaries: SalarieListItem[] = (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      magasin_id: string;
      nom: string | null;
      prenom: string;
      date_arrivee: string;
      date_depart: string | null;
      notes: string | null;
      profile_id: string | null;
      created_at: string;
      updated_at: string;
      magasins: { nom: string; code: string } | { nom: string; code: string }[] | null;
    };
    const magRaw = row.magasins;
    const mag = magRaw == null ? null : Array.isArray(magRaw) ? magRaw[0] : magRaw;
    return {
      id: row.id,
      magasin_id: row.magasin_id,
      nom: row.nom,
      prenom: row.prenom,
      date_arrivee: row.date_arrivee,
      date_depart: row.date_depart,
      notes: row.notes,
      profile_id: row.profile_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      magasin_nom: mag?.nom,
      magasin_code: mag?.code,
      actif: row.date_depart == null,
    };
  });

  return NextResponse.json({ salaries });
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
  const magasinId = typeof b.magasin_id === "string" ? b.magasin_id : "";
  const prenomResult = requireNonEmptyText(b.prenom, "prenom");
  const dateArrivee = parseIsoDate(b.date_arrivee);

  if (!magasinId) return NextResponse.json({ error: "magasin_id requis" }, { status: 400 });
  if (typeof prenomResult === "object") return NextResponse.json({ error: prenomResult.error }, { status: 400 });
  if (!dateArrivee) return NextResponse.json({ error: "date_arrivee invalide" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const siteGate = await requireSalariesSite(magasinId);
  if (!siteGate.ok) {
    return NextResponse.json({ error: siteGate.error }, { status: siteGate.status });
  }

  const notes = typeof b.notes === "string" ? b.notes.trim() || null : null;

  const { data, error } = await supabase
    .from("salarie")
    .insert({
      magasin_id: magasinId,
      nom: optionalTrimText(b.nom),
      prenom: prenomResult,
      date_arrivee: dateArrivee,
      notes,
      created_by: gate.userId,
    })
    .select("id, magasin_id, nom, prenom, date_arrivee, date_depart, notes, profile_id, created_at, updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Création impossible" }, { status: 500 });
  }

  return NextResponse.json({ salarie: data }, { status: 201 });
}
