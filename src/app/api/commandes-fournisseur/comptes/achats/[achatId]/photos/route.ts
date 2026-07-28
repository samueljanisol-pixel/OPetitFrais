import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { SUPPLIER_SOLE_VENDEUR_KEY } from "@/lib/commandes-fournisseur/achat-vendeur-key";
import {
  achatVendeurPhotoPublicUrl,
  isCommandeWhatsAppPhotoPath,
  removeAchatVendeurPhoto,
  uploadAchatVendeurPhoto,
} from "@/lib/commandes-fournisseur/achat-vendeur-photos";
import { isLotVendeurMediaEditable } from "@/lib/commandes-fournisseur/lot-status-achat";

type Ctx = { params: Promise<{ achatId: string }> };

async function resolveAchatVendeur(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  achatId: string,
): Promise<
  | { error: string; status: number }
  | { lotId: string; vendeurKey: string; lotStatus: string }
> {
  const { data: achat, error } = await supabase
    .from("fournisseur_compte_achat")
    .select("id, lot_id, vendeur_id, kind")
    .eq("id", achatId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!achat) return { error: "Introuvable", status: 404 };

  const lotId = String((achat as { lot_id: string }).lot_id);
  const kind = String((achat as { kind: string }).kind);
  const vendeurId = (achat as { vendeur_id?: string | null }).vendeur_id ?? null;
  const vendeurKey =
    kind === "station" || vendeurId == null ? SUPPLIER_SOLE_VENDEUR_KEY : String(vendeurId);

  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return { error: lotErr.message, status: 500 };
  if (!lot) return { error: "Lot introuvable", status: 404 };

  return {
    lotId,
    vendeurKey,
    lotStatus: String((lot as { status: string }).status),
  };
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { achatId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const resolved = await resolveAchatVendeur(supabase, achatId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!isLotVendeurMediaEditable(resolved.lotStatus)) {
    return NextResponse.json({ error: "Lot non modifiable" }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const up = await uploadAchatVendeurPhoto(supabase, {
    lotId: resolved.lotId,
    vendeurKey: resolved.vendeurKey,
    file,
  });
  if (up.error || !up.path) {
    return NextResponse.json({ error: up.error ?? "Upload impossible" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error: ie } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .insert({
      lot_id: resolved.lotId,
      vendeur_key: resolved.vendeurKey,
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
  const { achatId } = await ctx.params;
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
  const resolved = await resolveAchatVendeur(supabase, achatId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!isLotVendeurMediaEditable(resolved.lotStatus)) {
    return NextResponse.json({ error: "Lot non modifiable" }, { status: 409 });
  }

  const { data: row, error } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("lot_id", resolved.lotId)
    .eq("vendeur_key", resolved.vendeurKey)
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
