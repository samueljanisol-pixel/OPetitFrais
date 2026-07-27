import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiPermission("admin.magasins");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await ctx.params;
  let body: {
    code?: string;
    nom?: string;
    sort_order?: number;
    adresse?: string | null;
    ville?: string | null;
    lat?: number | null;
    lng?: number | null;
    google_maps_url?: string | null;
    visible_vitrine?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.code === "string") {
    const c = body.code.trim();
    if (!c) return NextResponse.json({ error: "Code invalide" }, { status: 400 });
    patch.code = c;
  }
  if (typeof body.nom === "string") {
    const n = body.nom.trim();
    if (!n) return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
    patch.nom = n;
  }
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) {
    patch.sort_order = body.sort_order;
  }
  if (body.adresse !== undefined) {
    patch.adresse = typeof body.adresse === "string" ? body.adresse.trim() || null : null;
  }
  if (body.ville !== undefined) {
    patch.ville = typeof body.ville === "string" ? body.ville.trim() || null : null;
  }
  if (body.google_maps_url !== undefined) {
    const url =
      typeof body.google_maps_url === "string" ? body.google_maps_url.trim() : "";
    patch.google_maps_url = url || null;
  }
  if (typeof body.visible_vitrine === "boolean") {
    patch.visible_vitrine = body.visible_vitrine;
  }
  if (body.lat !== undefined || body.lng !== undefined) {
    const lat = body.lat === null || body.lat === undefined ? null : Number(body.lat);
    const lng = body.lng === null || body.lng === undefined ? null : Number(body.lng);
    if ((lat == null) !== (lng == null)) {
      return NextResponse.json({ error: "Latitude et longitude doivent être renseignées ensemble" }, { status: 400 });
    }
    if (lat != null && lng != null) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return NextResponse.json({ error: "Coordonnées GPS invalides" }, { status: 400 });
      }
      patch.lat = lat;
      patch.lng = lng;
    } else {
      patch.lat = null;
      patch.lng = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { data: row, error } = await service
    .from("magasins")
    .update(patch)
    .eq("id", id)
    .select(
      "id, code, nom, sort_order, adresse, ville, lat, lng, google_maps_url, visible_vitrine, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: "Magasin introuvable" }, { status: 404 });
  }

  return NextResponse.json({ magasin: row });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiPermission("admin.magasins");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await ctx.params;

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const { error } = await service.from("magasins").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
