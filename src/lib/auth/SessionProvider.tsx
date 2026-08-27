"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SessionPayload } from "@/lib/auth/session-types";
import { readSessionSnapshot, writeSessionSnapshot } from "@/lib/auth/session-display-cache";

const SESSION_CHANGED_EVENT = "opf:session-changed";

/** Déclenche un rechargement de la session (login, logout, changement de profil). */
export function notifySessionChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
}

type SessionContextValue = {
  session: SessionPayload | null | undefined;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);

  const refreshSession = useCallback(async (optimistic = false) => {
    const snap = readSessionSnapshot();
    if (snap) {
      setSession(snap);
    } else if (optimistic) {
      setSession(null);
    }

    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (!res.ok) {
        // Erreur réseau / serveur : conserver le snapshot plutôt que vider le menu.
        return;
      }
      const j = (await res.json()) as { session: SessionPayload | null };
      setSession(j.session);
      writeSessionSnapshot(j.session);
      if (j.session?.uiLocale) {
        document.cookie = `locale=${j.session.uiLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    } catch {
      // Ne pas effacer une session affichable sur simple erreur réseau.
      if (!readSessionSnapshot()) {
        setSession(null);
      }
    }
  }, []);

  useLayoutEffect(() => {
    const snap = readSessionSnapshot();
    if (snap) setSession(snap);
  }, []);

  useEffect(() => {
    void refreshSession(false);
  }, [refreshSession]);

  useEffect(() => {
    const handler = () => void refreshSession(true);
    window.addEventListener(SESSION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, handler);
  }, [refreshSession]);

  const value = useMemo(() => ({ session }), [session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSessionContext must be used within SessionProvider");
  }
  return ctx;
}
