import type { SalarieDocumentRow } from "@/lib/salaries/types";

export function isSalarieDocumentImage(
  doc: Pick<SalarieDocumentRow, "mime_type" | "storage_path">,
): boolean {
  if (doc.mime_type?.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(doc.storage_path);
}

export function defaultPhotoLabel(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `Photo ${y}-${m}-${day}`;
}

export function labelFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base.length > 0 ? base : defaultPhotoLabel();
}
