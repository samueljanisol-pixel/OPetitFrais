import { useEffect, useState } from "react";

export type SyncRun = {
  started_at: string;
  finished_at: string | null;
  status: "success" | "error";
  message: string | null;
  last_synced_date: string | null;
  processed_days: number;
};

export type SyncStatusState = {
  last: SyncRun | null;
  /** Erreur réseau ou réponse HTTP (ex. 500 si clé service absente en prod). */
  error: string | null;
};

export function useSyncStatus(pollMs = 60000): SyncStatusState {
  const [last, setLast] = useState<SyncRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/supabase/sync/status", { cache: "no-store" });
        const json: unknown = await res.json().catch(() => null);
        if (!alive) return;

        if (!res.ok) {
          const msg =
            json && typeof json === "object" && json !== null && "error" in json
              ? String((json as { error: unknown }).error)
              : `Erreur HTTP ${res.status}`;
          setError(msg);
          setLast(null);
          return;
        }

        if (json && typeof json === "object" && "last" in json) {
          const lastVal = (json as { last?: unknown }).last ?? null;
          setLast(lastVal as SyncRun | null);
          setError(null);
        } else {
          setError("Réponse API inattendue");
          setLast(null);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Réseau");
        setLast(null);
      }
    };

    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return { last, error };
}
