import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { userHasMagasin } from "@/lib/commandes-fournisseur/api-helpers";
import { optionalTrimText, parseIsoDate, requireNonEmptyText, userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import { loadPaiementsForSalarie } from "@/lib/salaries/queries";
import { loadDocumentsForSalarie } from "@/lib/salaries/documents";

type Ctx = { params: Promise<{ id: string }> };

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

  const { data: magRaw } = await supabase
    .from("magasins")
    .select("nom, code, type")
    .eq("id", access.salarie.magasin_id)
    .maybeSingle();

  const paiementsResult = await loadPaiementsForSalarie(supabase, id);
  const docsResult = await loadDocumentsForSalarie(supabase, id);

  const { data: evenements } = await supabase
    .from("salarie_evenement")
    .select("id, salarie_id, kind, date_debut, date_fin, commentaire, created_at")
    .eq("salarie_id", id)
    .order("date_debut", { ascending: false });

  const { data: horaires } = await supabase
    .from("salarie_horaire")
    .select("id, salarie_id, day_of_week, is_repos, heure_debut, heure_fin")
    .eq("salarie_id", id)
    .order("day_of_week", { ascending: true });

  return NextResponse.json({
    salarie: {
      ...access.salarie,
      magasin_nom: magRaw?.nom ?? null,
      magasin_code: magRaw?.code ?? null,
      magasin_type: magRaw?.type ?? null,
      actif: access.salarie.date_depart == null,
    },
    paiements: "paiements" in paiementsResult ? paiementsResult.paiements : [],
    paiementSummary: "summary" in paiementsResult ? paiementsResult.summary : { total_salaires: 0, total_avances: 0, solde: 0 },
    documents: "documents" in docsResult ? docsResult.documents : [],
    evenements: evenements ?? [],
    horaires: horaires ?? [],
  });
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

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (b.nom !== undefined) {
    patch.nom = optionalTrimText(b.nom);
  }
  if (b.prenom !== undefined) {
    const prenomResult = requireNonEmptyText(b.prenom, "prenom");
    if (typeof prenomResult === "object") return NextResponse.json({ error: prenomResult.error }, { status: 400 });
    patch.prenom = prenomResult;
  }
  if (b.date_arrivee !== undefined) {
    const d = parseIsoDate(b.date_arrivee);
    if (!d) return NextResponse.json({ error: "date_arrivee invalide" }, { status: 400 });
    patch.date_arrivee = d;
  }
  if (b.date_depart !== undefined) {
    if (b.date_depart === null || b.date_depart === "") {
      patch.date_depart = null;
    } else {
      const d = parseIsoDate(b.date_depart);
      if (!d) return NextResponse.json({ error: "date_depart invalide" }, { status: 400 });
      patch.date_depart = d;
    }
  }
  if (b.notes !== undefined) {
    patch.notes = typeof b.notes === "string" ? b.notes.trim() || null : null;
  }
  if (b.magasin_id !== undefined) {
    const newMagasinId = typeof b.magasin_id === "string" ? b.magasin_id : "";
    if (!newMagasinId) {
      return NextResponse.json({ error: "magasin_id requis" }, { status: 400 });
    }
    if (newMagasinId !== access.salarie.magasin_id) {
      const hasNewMag = await userHasMagasin(supabase, gate.userId, newMagasinId);
      if (!hasNewMag) {
        return NextResponse.json({ error: "Accès magasin refusé" }, { status: 403 });
      }
    }
    patch.magasin_id = newMagasinId;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucune modification" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("salarie")
    .update(patch)
    .eq("id", id)
    .select("id, magasin_id, nom, prenom, date_arrivee, date_depart, notes, profile_id, created_at, updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Mise à jour impossible" }, { status: 500 });
  }

  return NextResponse.json({ salarie: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("salaries.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error } = await supabase.from("salarie").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
