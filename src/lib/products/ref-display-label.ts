import type { AppLocale } from "@/i18n/config";

export type RefLabelFields = {
  label: string;
  label_ar?: string | null;
};

/** Libellé référentiel selon la locale UI (arabe si dispo, sinon français). */
export function refDisplayLabel(row: RefLabelFields, locale: AppLocale): string {
  if (locale === "ar-MA") {
    const ar = row.label_ar?.trim();
    if (ar) return ar;
  }
  return row.label;
}
