"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isRtl, type AppLocale } from "@/i18n/config";
import { loadMessages, preloadMessages, seedMessagesCache, clearMessagesCache } from "@/lib/i18n/load-messages";

function applyHtmlLocale(locale: AppLocale) {
  const html = document.documentElement;
  html.lang = locale;
  html.dir = isRtl(locale) ? "rtl" : "ltr";
}

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

async function persistLocaleProfile(locale: AppLocale, authenticated: boolean) {
  if (!authenticated) return;
  const res = await fetch("/api/auth/locale", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) {
    throw new Error("locale_update_failed");
  }
}

type LocaleClientContextValue = {
  locale: AppLocale;
  messages: Record<string, unknown>;
  timeZone: string;
  /** Locale affichée (optimiste pendant le chargement). */
  activeLocale: AppLocale;
  loading: boolean;
  setLocale: (next: AppLocale, options?: { persistProfile?: boolean }) => Promise<void>;
  /** Recharge les messages (après édition dans Paramètres). */
  refreshMessages: () => Promise<void>;
};

const LocaleClientContext = createContext<LocaleClientContextValue | null>(null);

export function useLocaleClient(): LocaleClientContextValue {
  const ctx = useContext(LocaleClientContext);
  if (!ctx) {
    throw new Error("useLocaleClient must be used within LocaleClientProvider");
  }
  return ctx;
}

type LocaleClientProviderProps = {
  initialLocale: AppLocale;
  initialMessages: Record<string, unknown>;
  timeZone: string;
  children: ReactNode;
};

export function LocaleClientProvider({
  initialLocale,
  initialMessages,
  timeZone,
  children,
}: LocaleClientProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [messages, setMessages] = useState(initialMessages);
  const [pendingLocale, setPendingLocale] = useState<AppLocale | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    seedMessagesCache(initialLocale, initialMessages);
    const other: AppLocale = initialLocale === "fr" ? "ar-MA" : "fr";
    preloadMessages(other);
  }, [initialLocale, initialMessages]);

  useEffect(() => {
    applyHtmlLocale(locale);
  }, [locale]);

  const setLocale = useCallback(
    async (next: AppLocale, options?: { persistProfile?: boolean }) => {
      if (next === locale || loading) return;

      setPendingLocale(next);
      setLoading(true);
      setLocaleCookie(next);

      try {
        const msgs = await loadMessages(next);
        setLocaleState(next);
        setMessages(msgs);
        applyHtmlLocale(next);

        if (options?.persistProfile) {
          void persistLocaleProfile(next, true).catch(() => {
            /* cookie déjà posé ; profil resynchronisé à la prochaine session */
          });
        }

        const other: AppLocale = next === "fr" ? "ar-MA" : "fr";
        preloadMessages(other);
      } catch {
        setLocaleCookie(locale);
        applyHtmlLocale(locale);
        throw new Error("locale_switch_failed");
      } finally {
        setLoading(false);
        setPendingLocale(null);
      }
    },
    [locale, loading],
  );

  const refreshMessages = useCallback(async () => {
    clearMessagesCache();
    const frMsgs = await loadMessages("fr");
    const arMsgs = await loadMessages("ar-MA");
    if (locale === "fr") {
      setMessages(frMsgs);
    } else {
      setMessages(arMsgs);
    }
    preloadMessages(locale === "fr" ? "ar-MA" : "fr");
  }, [locale]);

  const value = useMemo(
    (): LocaleClientContextValue => ({
      locale,
      messages,
      timeZone,
      activeLocale: pendingLocale ?? locale,
      loading,
      setLocale,
      refreshMessages,
    }),
    [locale, messages, timeZone, pendingLocale, loading, setLocale, refreshMessages],
  );

  return <LocaleClientContext.Provider value={value}>{children}</LocaleClientContext.Provider>;
}
