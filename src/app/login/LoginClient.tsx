"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SessionPayload } from "@/lib/auth/session-types";
import { writeSessionSnapshot } from "@/lib/auth/session-display-cache";
import { authErrorCode } from "@/lib/auth/auth-error-fr";
import LocaleSwitcher from "@/components/LocaleSwitcher";

export default function LoginClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const redirectTo = sp.get("redirectTo") || "/";
  const t = useTranslations("backoffice.login");
  const tAuth = useTranslations("backoffice.auth.errors");
  const tCommon = useTranslations("common");

  const formRef = useRef<HTMLFormElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readFormCredentials = () => {
    const form = formRef.current;
    if (!form) {
      return { identifier: identifier.trim(), password };
    }
    const data = new FormData(form);
    return {
      identifier: String(data.get("identifier") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };
  };

  const signIn = async () => {
    if (loading) return;
    const { identifier: id, password: pwd } = readFormCredentials();
    if (!id || !pwd) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: id, password: pwd }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; errorCode?: string };
      if (!res.ok) {
        const code = json.errorCode ?? authErrorCode(json.error);
        setError(tAuth(code as "invalid_credentials"));
        setLoading(false);
        return;
      }
      try {
        const sRes = await fetch("/api/auth/session", { credentials: "include" });
        const sJson = (await sRes.json()) as { session: SessionPayload | null };
        writeSessionSnapshot(sJson.session);
      } catch {
        /* l'en-tête rechargera la session au prochain écran */
      }
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError(tCommon("networkError"));
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
      <div className="relative w-full max-w-md">
        <div className="absolute end-0 top-0 -translate-y-full pb-3">
          <LocaleSwitcher variant="login" />
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div>
            <div className="text-sm font-medium text-emerald-900/80">{t("brand")}</div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">{t("title")}</div>
          </div>

          <p className="mt-3 text-xs text-slate-600">{t("hint")}</p>

          <form
            ref={formRef}
            className="mt-6 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void signIn();
            }}
          >
            <label className="grid gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("identifierLabel")}
              </span>
              <input
                name="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onInput={(e) => setIdentifier(e.currentTarget.value)}
                type="text"
                autoComplete="username"
                required
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
                placeholder={t("identifierPlaceholder")}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("passwordLabel")}
              </span>
              <input
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword(e.currentTarget.value)}
                type="password"
                autoComplete="current-password"
                required
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
                placeholder="••••••••"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("connecting") : t("connect")}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
