"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionPayload } from "@/lib/auth/session-types";
import { writeSessionSnapshot } from "@/lib/auth/session-display-cache";

export default function LoginClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const redirectTo = sp.get("redirectTo") || "/";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (loading || !identifier.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Connexion impossible");
        setLoading(false);
        return;
      }
      try {
        const sRes = await fetch("/api/auth/session", { credentials: "include" });
        const sJson = (await sRes.json()) as { session: SessionPayload | null };
        writeSessionSnapshot(sJson.session);
      } catch {
        /* l’en-tête rechargera la session au prochain écran */
      }
      router.replace(redirectTo);
      router.refresh();
      /* Laisser le bouton en « Connexion en cours… » jusqu’à la navigation. */
    } catch {
      setError("Erreur réseau");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div>
          <div className="text-sm font-medium text-emerald-900/80">O&apos; Petit Frais</div>
          <div className="text-lg font-semibold tracking-tight text-slate-900">Connexion</div>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          Utilisez votre <strong>adresse e-mail</strong> ou votre <strong>identifiant</strong> (login magasin).
        </p>

        <form
          className="mt-6 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">E-mail ou identifiant</span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              type="text"
              autoComplete="username"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              placeholder="ex: moi@exemple.com ou caisse1"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Mot de passe</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !identifier.trim() || !password}
            className="mt-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Connexion en cours…" : "Se connecter"}
          </button>
        </form>
      </div>
    </main>
  );
}
