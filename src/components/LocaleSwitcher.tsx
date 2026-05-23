"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { isAppLocale, type AppLocale } from "@/i18n/config";

type LocaleSwitcherProps = {
  /** Sur la page login, pas de session : cookie seulement via l'API. */
  variant?: "header" | "login";
  className?: string;
};

async function persistLocale(locale: AppLocale, authenticated: boolean) {
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  if (authenticated) {
    await fetch("/api/auth/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ locale }),
    });
  }
}

export default function LocaleSwitcher({ variant = "header", className = "" }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const { session } = useSessionPermissions();
  const authenticated = Boolean(session?.userId);

  const switchTo = (next: AppLocale) => {
    if (next === locale) return;
    void (async () => {
      await persistLocale(next, variant === "header" && authenticated);
      router.refresh();
    })();
  };

  const baseBtn =
    "rounded-md px-2 py-0.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500";
  const active = "bg-emerald-600 text-white";
  const inactive = "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800";

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-emerald-100 bg-white/90 p-0.5 ${className}`}
      role="group"
      aria-label={t("languageSwitcher")}
    >
      <button
        type="button"
        className={`${baseBtn} ${locale === "fr" ? active : inactive}`}
        aria-pressed={locale === "fr"}
        onClick={() => switchTo("fr")}
      >
        FR
      </button>
      <button
        type="button"
        className={`${baseBtn} ${locale === "ar-MA" ? active : inactive}`}
        aria-pressed={locale === "ar-MA"}
        onClick={() => switchTo("ar-MA")}
      >
        عربي
      </button>
    </div>
  );
}

export function readClientLocale(): AppLocale {
  if (typeof document === "undefined") return "fr";
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isAppLocale(value) ? value : "fr";
}
