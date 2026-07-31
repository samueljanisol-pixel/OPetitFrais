import type { CaisseDisplayLocale } from "../data/catalog-helpers";

const DISPLAY_LOCALE_KEY = "caisse:display-locale";

export function loadDisplayLocale(): CaisseDisplayLocale {
  if (typeof window === "undefined" || !window.localStorage) return "fr";
  const raw = window.localStorage.getItem(DISPLAY_LOCALE_KEY);
  return raw === "ar" ? "ar" : "fr";
}

export function saveDisplayLocale(locale: CaisseDisplayLocale): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(DISPLAY_LOCALE_KEY, locale);
}
