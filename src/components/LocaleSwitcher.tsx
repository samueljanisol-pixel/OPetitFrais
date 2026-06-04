"use client";

import { useTranslations } from "next-intl";
import CircularProgress from "@mui/material/CircularProgress";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { isAppLocale, type AppLocale } from "@/i18n/config";
import { useLocaleClient } from "@/lib/i18n/locale-client";

type LocaleSwitcherProps = {
  /** Sur la page login, pas de session : cookie seulement. */
  variant?: "header" | "login";
  className?: string;
};

export default function LocaleSwitcher({ variant = "header", className = "" }: LocaleSwitcherProps) {
  const t = useTranslations("common");
  const { session } = useSessionPermissions();
  const { activeLocale, loading, setLocale } = useLocaleClient();
  const authenticated = Boolean(session?.userId);

  const switchTo = (next: AppLocale) => {
    if (next === activeLocale || loading) return;
    void setLocale(next, { persistProfile: variant === "header" && authenticated });
  };

  const baseBtn =
    "rounded-md px-2 py-0.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:cursor-default";
  const active = "bg-emerald-600 text-white shadow-sm";
  const inactive = "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800";

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-100 bg-white/90 p-0.5 ${className}`}
      role="group"
      aria-label={t("languageSwitcher")}
      aria-busy={loading}
    >
      <button
        type="button"
        disabled={loading}
        className={`${baseBtn} ${activeLocale === "fr" ? active : inactive}`}
        aria-pressed={activeLocale === "fr"}
        onClick={() => switchTo("fr")}
      >
        FR
      </button>
      <button
        type="button"
        disabled={loading}
        className={`${baseBtn} ${activeLocale === "ar-MA" ? active : inactive}`}
        aria-pressed={activeLocale === "ar-MA"}
        onClick={() => switchTo("ar-MA")}
      >
        عربي
      </button>
      {loading ? (
        <CircularProgress
          size={14}
          thickness={5}
          className="!text-emerald-600"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

export function readClientLocale(): AppLocale {
  if (typeof document === "undefined") return "fr";
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isAppLocale(value) ? value : "fr";
}
