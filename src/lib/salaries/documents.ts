import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalarieDocumentRow } from "@/lib/salaries/types";

export const SALARIES_DOCUMENTS_BUCKET = "salaries-documents";

const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif", "pdf"] as const;

export function salarieDocumentPublicUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(SALARIES_DOCUMENTS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadSalarieDocument(
  supabase: SupabaseClient,
  opts: { salarieId: string; file: File },
): Promise<{ path: string | null; mimeType: string | null; error: string | null }> {
  const ext = opts.file.name.split(".").pop()?.toLowerCase();
  const safe = ext && (ALLOWED_EXT as readonly string[]).includes(ext) ? ext : "pdf";
  const path = `salaries/${opts.salarieId}/${randomUUID()}.${safe}`;
  const { error } = await supabase.storage
    .from(SALARIES_DOCUMENTS_BUCKET)
    .upload(path, opts.file, { upsert: false, contentType: opts.file.type || undefined });
  if (error) return { path: null, mimeType: null, error: error.message };
  return { path, mimeType: opts.file.type || null, error: null };
}

export async function removeSalarieDocumentFile(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(SALARIES_DOCUMENTS_BUCKET).remove([storagePath]);
  if (error) return { error: error.message };
  return { error: null };
}

export async function loadDocumentsForSalarie(
  supabase: SupabaseClient,
  salarieId: string,
): Promise<{ error: string } | { documents: SalarieDocumentRow[] }> {
  const { data, error } = await supabase
    .from("salarie_document")
    .select("id, salarie_id, label, storage_path, mime_type, created_at")
    .eq("salarie_id", salarieId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };

  const documents: SalarieDocumentRow[] = (data ?? []).map((row) => {
    const storage_path = String((row as { storage_path: string }).storage_path);
    return {
      id: String((row as { id: string }).id),
      salarie_id: String((row as { salarie_id: string }).salarie_id),
      label: String((row as { label: string }).label),
      storage_path,
      mime_type: (row as { mime_type: string | null }).mime_type,
      url: salarieDocumentPublicUrl(supabase, storage_path),
      created_at: String((row as { created_at: string }).created_at),
    };
  });

  return { documents };
}
