"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalariesSite } from "@/lib/salaries/sites";

export function useSalariesSites(enabled: boolean) {
  const [sites, setSites] = useState<SalariesSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setSites([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/salaries/sites", { credentials: "include" });
      const json = (await res.json()) as { sites?: SalariesSite[]; error?: string };
      if (!res.ok) {
        setErr(json.error ?? "Chargement impossible");
        setSites([]);
        return;
      }
      setSites(json.sites ?? []);
    } catch {
      setErr("Erreur réseau");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { sites, loading, err, reload: load };
}
