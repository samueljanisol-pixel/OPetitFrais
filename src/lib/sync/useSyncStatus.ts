import { useEffect, useState } from "react";

export type SyncRun = {
  started_at: string;
  finished_at: string | null;
  status: "success" | "error";
  message: string | null;
  last_synced_date: string | null;
  processed_days: number;
};

export function useSyncStatus(pollMs = 60000) {
  const [last, setLast] = useState<SyncRun | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/supabase/sync/status", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && json && typeof json === "object" && "last" in json) {
          setLast((json as any).last ?? null);
        }
      } catch {
        // ignore
      }
    };

    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return last;
}

