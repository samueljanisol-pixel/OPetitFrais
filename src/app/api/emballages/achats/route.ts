import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  FICHE_SELECT,
  isIsoDate,
  LIGNE_SELECT,
  parseFicheRow,
  parseLigneRow,
  sumLignesMontant,
} from "@/lib/emballages/achat-api";
import type { EmballageAchatFicheRow } from "@/lib/emballages/types";
import { validateEmballagesVendeurId } from "@/lib/emballages/supplier-api";

export async function GET(req: Request) {
  const gate = await requireAnyApiPermission(["emballages.read", "emballages.write"]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";
  const statut = url.searchParams.get("statut")?.trim() ?? "";

  if (from && !isIsoDate(from)) {
    return NextResponse.json({ error: "Date début invalide (YYYY-MM-DD)" }, { status: 400 });
  }
  if (to && !isIsoDate(to)) {
    return NextResponse.json({ error: "Date fin invalide (YYYY-MM-DD)" }, { status: 400 });
  }
  if (statut && statut !== "ouvert" && statut !== "cloture") {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  let query = service
    .from("emballage_achat_fiche")
    .select(FICHE_SELECT)
    .order("date_achat", { ascending: false })
    .order("created_at", { ascending: false });

  if (from) query = query.gte("date_achat", from);
  if (to) query = query.lte("date_achat", to);
  if (statut) query = query.eq("statut", statut);

  const { data: fichesRaw, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fiches = (fichesRaw ?? []).map((r) => parseFicheRow(r as Record<string, unknown>));
  const ids = fiches.map((f) => f.id);
  const totalsByFiche: Record<string, number> = {};
  const countsByFiche: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: lignes, error: le } = await service
      .from("emballage_achat_ligne")
      .select("fiche_id, quantite, prix_unitaire")
      .in("fiche_id", ids);
    if (le) {
      return NextResponse.json({ error: le.message }, { status: 500 });
    }
    for (const row of lignes ?? []) {
      const fid = row.fiche_id as string;
      countsByFiche[fid] = (countsByFiche[fid] ?? 0) + 1;
      const q = typeof row.quantite === "number" ? row.quantite : Number(row.quantite);
      const p = typeof row.prix_unitaire === "number" ? row.prix_unitaire : Number(row.prix_unitaire);
      if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
      totalsByFiche[fid] = (totalsByFiche[fid] ?? 0) + q * p;
    }
  }

  const achats: EmballageAchatFicheRow[] = fiches.map((f) => ({
    ...f,
    total: totalsByFiche[f.id] ?? 0,
    ligne_count: countsByFiche[f.id] ?? 0,
  }));

  return NextResponse.json({ achats });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("emballages.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { date_achat?: string; note?: string | null; vendeur_id?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const date_achat =
    typeof body.date_achat === "string" && body.date_achat.trim()
      ? body.date_achat.trim()
      : new Date().toISOString().slice(0, 10);
  if (!isIsoDate(date_achat)) {
    return NextResponse.json({ error: "Date invalide (YYYY-MM-DD)" }, { status: 400 });
  }

  const note =
    body.note == null || body.note === ""
      ? null
      : typeof body.note === "string"
        ? body.note.trim() || null
        : null;

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  let vendeur_id: string | null = null;
  if ("vendeur_id" in body) {
    if (body.vendeur_id == null || body.vendeur_id === "") {
      vendeur_id = null;
    } else if (typeof body.vendeur_id === "string" && body.vendeur_id.trim()) {
      const check = await validateEmballagesVendeurId(service, body.vendeur_id.trim());
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      vendeur_id = body.vendeur_id.trim();
    }
  }

  const { data, error } = await service
    .from("emballage_achat_fiche")
    .insert({ date_achat, statut: "ouvert", note, vendeur_id })
    .select(FICHE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fiche = parseFicheRow(data as Record<string, unknown>);
  return NextResponse.json({ achat: { ...fiche, total: 0, ligne_count: 0 } });
}
