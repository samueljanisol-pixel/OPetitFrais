"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const redirectTo = sp.get("redirectTo") || "/";

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(redirectTo);
  };

  return (
    <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-emerald-100">
            <Image
              src="/logo-opetitfrais.png"
              alt="O' Petit Frais"
              fill
              className="object-contain p-1"
              sizes="48px"
              priority
            />
          </div>
          <div>
            <div className="text-sm font-medium text-emerald-900/80">O&apos; Petit Frais</div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">Connexion</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              placeholder="ex: toi@exemple.com"
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
            type="button"
            onClick={signIn}
            disabled={loading || !email || !password}
            className="mt-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </div>
    </main>
  );
}

