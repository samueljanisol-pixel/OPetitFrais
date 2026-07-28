import type { SupabaseClient } from "@supabase/supabase-js";

export const ACHAT_VENDEUR_PHOTOS_BUCKET = "achat-vendeur-photos";

/** Nom fixe : image commande / WhatsApp (une par vendeur, remplacée à chaque envoi). */
export const COMMANDE_WHATSAPP_PHOTO_FILENAME = "commande-whatsapp.png";

export function commandeWhatsAppPhotoPath(lotId: string, vendeurKey: string): string {
  return `lots/${lotId}/${vendeurKey}/${COMMANDE_WHATSAPP_PHOTO_FILENAME}`;
}

/** Photo commande / WhatsApp auto — non supprimable. */
export function isCommandeWhatsAppPhotoPath(storagePath: string): boolean {
  return storagePath.endsWith(`/${COMMANDE_WHATSAPP_PHOTO_FILENAME}`) || storagePath === COMMANDE_WHATSAPP_PHOTO_FILENAME;
}

/** Photos « métier » hors image commande WhatsApp (pour badge vert / alerte clôture). */
export function hasAchatVendeurExtraPhotos(
  photos: ReadonlyArray<{ storage_path?: string | null }>,
): boolean {
  return photos.some((ph) => {
    const path = typeof ph.storage_path === "string" ? ph.storage_path : "";
    return path.length > 0 && !isCommandeWhatsAppPhotoPath(path);
  });
}

export function achatVendeurPhotoPublicUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(ACHAT_VENDEUR_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadAchatVendeurPhoto(
  supabase: SupabaseClient,
  opts: { lotId: string; vendeurKey: string; file: File },
): Promise<{ path: string | null; error: string | null }> {
  const ext = opts.file.name.split(".").pop()?.toLowerCase();
  const safe = ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const path = `lots/${opts.lotId}/${opts.vendeurKey}/${Date.now()}.${safe}`;
  const { error } = await supabase.storage
    .from(ACHAT_VENDEUR_PHOTOS_BUCKET)
    .upload(path, opts.file, { upsert: false });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/** Upsert Storage + ligne DB pour l’image commande envoyée (WhatsApp / récap validation). */
export async function upsertAchatVendeurCommandeWhatsAppPhoto(
  supabase: SupabaseClient,
  opts: {
    lotId: string;
    vendeurKey: string;
    file: File | Blob;
    createdBy?: string | null;
  },
): Promise<{ path: string | null; photoId: string | null; error: string | null }> {
  const path = commandeWhatsAppPhotoPath(opts.lotId, opts.vendeurKey);
  const file =
    opts.file instanceof File
      ? opts.file
      : new File([opts.file], COMMANDE_WHATSAPP_PHOTO_FILENAME, { type: "image/png" });

  const { error: upErr } = await supabase.storage
    .from(ACHAT_VENDEUR_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: "image/png" });
  if (upErr) return { path: null, photoId: null, error: upErr.message };

  const { data: existing, error: selErr } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .select("id")
    .eq("lot_id", opts.lotId)
    .eq("vendeur_key", opts.vendeurKey)
    .eq("storage_path", path)
    .maybeSingle();
  if (selErr) return { path, photoId: null, error: selErr.message };

  if (existing) {
    return { path, photoId: String((existing as { id: string }).id), error: null };
  }

  const { data: inserted, error: ie } = await supabase
    .from("commande_fournisseur_lot_vendeur_photo")
    .insert({
      lot_id: opts.lotId,
      vendeur_key: opts.vendeurKey,
      storage_path: path,
      created_by: opts.createdBy ?? null,
    })
    .select("id")
    .maybeSingle();

  if (ie || !inserted) {
    return { path, photoId: null, error: ie?.message ?? "Insertion photo refusée" };
  }
  return { path, photoId: String((inserted as { id: string }).id), error: null };
}

export async function removeAchatVendeurPhoto(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(ACHAT_VENDEUR_PHOTOS_BUCKET).remove([storagePath]);
  if (error) return { error: error.message };
  return { error: null };
}
