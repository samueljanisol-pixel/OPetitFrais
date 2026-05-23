import { LOCALE_COOKIE_NAME, normalizeLocale, type AppLocale } from "@/i18n/config";

export { LOCALE_COOKIE_NAME };

export function localeCookieOptions(locale: AppLocale) {
  return {
    name: LOCALE_COOKIE_NAME,
    value: locale,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };
}

export function readLocaleFromCookieHeader(cookieHeader: string | null | undefined): AppLocale {
  if (!cookieHeader) return normalizeLocale(null);
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE_NAME}=([^;]+)`));
  return normalizeLocale(match?.[1] ? decodeURIComponent(match[1]) : null);
}
