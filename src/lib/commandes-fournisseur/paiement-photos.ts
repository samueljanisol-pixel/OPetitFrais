import type { SupabaseClient } from "@supabase/supabase-js";

export const PAIEMENT_PHOTOS_BUCKET = "paiement-photos";

export type PaiementPhotoRow = {
  id: string;
  storage_path: string;
  url: string | null;
  created_at: string;
};

export function paiementPhotoPublicUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(PAIEMENT_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadPaiementPhoto(
  supabase: SupabaseClient,
  opts: { paiementId: string; file: File },
): Promise<{ path: string | null; error: string | null }> {
  const ext = opts.file.name.split(".").pop()?.toLowerCase();
  const safe = ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const path = `paiements/${opts.paiementId}/${Date.now()}.${safe}`;
  const { error } = await supabase.storage
    .from(PAIEMENT_PHOTOS_BUCKET)
    .upload(path, opts.file, { upsert: false });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function removePaiementPhoto(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(PAIEMENT_PHOTOS_BUCKET).remove([storagePath]);
  if (error) return { error: error.message };
  return { error: null };
}

export async function loadPhotosForPaiement(
  supabase: SupabaseClient,
  paiementId: string,
): Promise<{ error: string } | { photos: PaiementPhotoRow[] }> {
  const { data, error } = await supabase
    .from("fournisseur_paiement_photo")
    .select("id, storage_path, created_at")
    .eq("paiement_id", paiementId)
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };

  const photos: PaiementPhotoRow[] = (data ?? []).map((row) => {
    const storage_path = String((row as { storage_path: string }).storage_path);
    return {
      id: String((row as { id: string }).id),
      storage_path,
      url: paiementPhotoPublicUrl(supabase, storage_path),
      created_at: String((row as { created_at: string }).created_at),
    };
  });

  return { photos };
}

export async function loadPhotoCountsForPaiements(
  supabase: SupabaseClient,
  paiementIds: string[],
): Promise<{ error: string } | Map<string, number>> {
  const counts = new Map<string, number>();
  if (paiementIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("fournisseur_paiement_photo")
    .select("paiement_id")
    .in("paiement_id", paiementIds);

  if (error) return { error: error.message };

  for (const row of data ?? []) {
    const pid = String((row as { paiement_id: string }).paiement_id);
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }

  return counts;
}
