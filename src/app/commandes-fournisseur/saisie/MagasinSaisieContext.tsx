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
import type { SessionMagasin } from "@/lib/auth/session-types";

const STORAGE_KEY = "commandes_fournisseur.magasin_actif_id";

type Ctx = {
  magasins: SessionMagasin[];
  magasinId: string | null;
  setMagasinId: (id: string) => void;
  currentMagasin: SessionMagasin | null;
};

const MagasinSaisieContext = createContext<Ctx | null>(null);

export function MagasinSaisieProvider({
  children,
  magasins,
}: {
  children: ReactNode;
  magasins: SessionMagasin[];
}) {
  const [magasinId, setMagasinIdState] = useState<string | null>(null);

  useEffect(() => {
    if (magasins.length === 0) {
      setMagasinIdState(null);
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && magasins.some((m) => m.id === stored)) {
        setMagasinIdState(stored);
        return;
      }
    } catch {
      /* ignore */
    }
    setMagasinIdState(magasins[0]!.id);
  }, [magasins]);

  const setMagasinId = useCallback((id: string) => {
    setMagasinIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const currentMagasin = useMemo(
    () => magasins.find((m) => m.id === magasinId) ?? magasins[0] ?? null,
    [magasins, magasinId],
  );

  const value = useMemo(
    () => ({ magasins, magasinId, setMagasinId, currentMagasin }),
    [magasins, magasinId, setMagasinId, currentMagasin],
  );

  return <MagasinSaisieContext.Provider value={value}>{children}</MagasinSaisieContext.Provider>;
}

export function useMagasinSaisie(): Ctx {
  const c = useContext(MagasinSaisieContext);
  if (!c) {
    throw new Error("useMagasinSaisie hors fournisseur");
  }
  return c;
}

export function useMagasinSaisieOptional(): Ctx | null {
  return useContext(MagasinSaisieContext);
}
