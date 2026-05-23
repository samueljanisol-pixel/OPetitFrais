export const locales = ["fr", "ar-MA"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "fr";

/** Fuseau horaire Maroc — évite ENVIRONMENT_FALLBACK next-intl. */
export const defaultTimeZone = "Africa/Casablanca";

export const LOCALE_COOKIE_NAME = "locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "fr" || value === "ar-MA";
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (isAppLocale(value)) return value;
  return defaultLocale;
}

export function isRtl(locale: AppLocale): boolean {
  return locale === "ar-MA";
}

export function intlLocale(locale: AppLocale): string {
  return locale === "ar-MA" ? "ar-MA" : "fr-FR";
}
