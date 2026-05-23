/** Conditionnement non archivé (visible catalogue / saisie). */
export type PackagingWithArchive = {
  archived_at?: string | null;
};

export function isPackagingArchived(pack: PackagingWithArchive | null | undefined): boolean {
  if (pack == null) {
    return false;
  }
  const raw = pack.archived_at;
  return typeof raw === "string" && raw.trim().length > 0;
}

export function filterActivePackaging<T extends PackagingWithArchive>(
  packs: T[] | null | undefined,
): T[] {
  return (packs ?? []).filter((p) => !isPackagingArchived(p));
}

/** Payload Supabase pour archiver un conditionnement. */
export function productPackagingArchiveUpdate(): {
  archived_at: string;
  available_for_sale: boolean;
  available_for_purchase: boolean;
} {
  return {
    archived_at: new Date().toISOString(),
    available_for_sale: false,
    available_for_purchase: false,
  };
}
