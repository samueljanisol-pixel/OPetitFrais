import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  loadPhotosForPaiement,
  paiementPhotoPublicUrl,
  removePaiementPhoto,
  uploadPaiementPhoto,
} from "@/lib/commandes-fournisseur/paiement-photos";

type Ctx = { params: Promise<{ paiementId: string }> };

async function paiementExists(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  paiementId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("fournisseur_paiement")
    .select("id")
    .eq("id", paiementId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { paiementId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  if (!(await paiementExists(supabase, paiementId))) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }

  const result = await loadPhotosForPaiement(supabase, paiementId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ photos: result.photos });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { paiementId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  if (!(await paiementExists(supabase, paiementId))) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const up = await uploadPaiementPhoto(supabase, { paiementId, file });
  if (up.error || !up.path) {
    return NextResponse.json({ error: up.error ?? "Upload impossible" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error: ie } = await supabase
    .from("fournisseur_paiement_photo")
    .insert({
      paiement_id: paiementId,
      storage_path: up.path,
      created_by: user?.id ?? null,
    })
    .select("id, storage_path, created_at")
    .maybeSingle();

  if (ie || !inserted) {
    await removePaiementPhoto(supabase, up.path);
    return NextResponse.json({ error: ie?.message ?? "Insertion refusée" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: String((inserted as { id: string }).id),
      storage_path: up.path,
      url: paiementPhotoPublicUrl(supabase, up.path),
      created_at: (inserted as { created_at: string }).created_at,
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { paiementId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const photoId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { photoId?: unknown }).photoId === "string"
      ? (body as { photoId: string }).photoId
      : "";
  if (!photoId) {
    return NextResponse.json({ error: "photoId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!(await paiementExists(supabase, paiementId))) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from("fournisseur_paiement_photo")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("paiement_id", paiementId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  const path = String((row as { storage_path: string }).storage_path);

  const { error: de } = await supabase
    .from("fournisseur_paiement_photo")
    .delete()
    .eq("id", photoId);
  if (de) return NextResponse.json({ error: de.message }, { status: 500 });

  await removePaiementPhoto(supabase, path);
  return NextResponse.json({ ok: true });
}
