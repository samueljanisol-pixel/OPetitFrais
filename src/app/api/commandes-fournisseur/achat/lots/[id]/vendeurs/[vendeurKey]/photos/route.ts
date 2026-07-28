import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  achatVendeurPhotoPublicUrl,
  isCommandeWhatsAppPhotoPath,
  removeAchatVendeurPhoto,
  uploadAchatVendeurPhoto,
} from "@/lib/commandes-fournisseur/achat-vendeur-photos";
import {
  ensureLotAchatEnCours,
  isLotAchatEditable,
} from "@/lib/commandes-fournisseur/lot-status-achat";

type Ctx = { params: Promise<{ id: string; vendeurKey: string }> };

function decodeKey(raw: string): string {
  return decodeURIComponent(raw);
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id: lotId, vendeurKey: rawKey } = await ctx.params;
  const vendeurKey = decodeKey(rawKey);
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .select("id, lot_id, vendeur_key, storage_path, created_at")
    .eq("lot_id", lotId)
    .eq("vendeur_key", vendeurKey)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const photos = (data ?? []).map((row) => {
    const path = String((row as { storage_path: string }).storage_path);
    return {
      id: String((row as { id: string }).id),
      storage_path: path,
      url: achatVendeurPhotoPublicUrl(supabase, path),
      created_at: (row as { created_at: string }).created_at,
    };
  });

  return NextResponse.json({ photos });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: lotId, vendeurKey: rawKey } = await ctx.params;
  const vendeurKey = decodeKey(rawKey);
  const gate = await requireApiPermission("commandes_fournisseur.achat");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 });
  if (!lot) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!isLotAchatEditable((lot as { status: string }).status)) {
    return NextResponse.json({ error: "Lot non modifiable" }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const marked = await ensureLotAchatEnCours(supabase, lotId);
  if ("error" in marked) {
    return NextResponse.json({ error: marked.error }, { status: 500 });
  }

  const up = await uploadAchatVendeurPhoto(supabase, { lotId, vendeurKey, file });
  if (up.error || !up.path) {
    return NextResponse.json({ error: up.error ?? "Upload impossible" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error: ie } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .insert({
      lot_id: lotId,
      vendeur_key: vendeurKey,
      storage_path: up.path,
      created_by: user?.id ?? null,
    })
    .select("id, storage_path, created_at")
    .maybeSingle();

  if (ie || !inserted) {
    await removeAchatVendeurPhoto(supabase, up.path);
    return NextResponse.json({ error: ie?.message ?? "Insertion refusée" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: String((inserted as { id: string }).id),
      storage_path: up.path,
      url: achatVendeurPhotoPublicUrl(supabase, up.path),
      created_at: (inserted as { created_at: string }).created_at,
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id: lotId, vendeurKey: rawKey } = await ctx.params;
  const vendeurKey = decodeKey(rawKey);
  const gate = await requireApiPermission("commandes_fournisseur.achat");
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
    typeof body === "object" && body !== null && typeof (body as { photoId?: unknown }).photoId === "string"
      ? (body as { photoId: string }).photoId
      : "";
  if (!photoId) {
    return NextResponse.json({ error: "photoId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 });
  if (!lot) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!isLotAchatEditable((lot as { status: string }).status)) {
    return NextResponse.json({ error: "Lot non modifiable" }, { status: 409 });
  }

  const { data: row, error } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("lot_id", lotId)
    .eq("vendeur_key", vendeurKey)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  const path = String((row as { storage_path: string }).storage_path);
  if (isCommandeWhatsAppPhotoPath(path)) {
    return NextResponse.json(
      { error: "La photo de commande ne peut pas être supprimée" },
      { status: 403 },
    );
  }
  const { error: de } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .delete()
    .eq("id", photoId);
  if (de) return NextResponse.json({ error: de.message }, { status: 500 });

  await removeAchatVendeurPhoto(supabase, path);
  return NextResponse.json({ ok: true });
}
