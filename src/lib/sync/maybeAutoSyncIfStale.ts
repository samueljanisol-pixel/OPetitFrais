/**
 * Client : si la dernière ligne `sync_runs` a plus de `maxAgeMs` (ou est absente),
 * lance POST `/api/supabase/sync/trigger` (session requise).
 * Les erreurs sont ignorées pour ne pas bloquer l’affichage.
 */
export const DEFAULT_SYNC_STALE_MS = 15 * 60 * 1000

export async function maybeAutoSyncIfStale(maxAgeMs = DEFAULT_SYNC_STALE_MS): Promise<void> {
  try {
    const r = await fetch("/api/supabase/sync/status", { cache: "no-store" })
    if (!r.ok) return
    const j: unknown = await r.json().catch(() => null)
    if (!j || typeof j !== "object" || !("last" in j)) return
    const last = (j as { last?: { finished_at?: string | null } | null }).last
    const finished = last?.finished_at
    if (finished) {
      const age = Date.now() - new Date(finished).getTime()
      if (age <= maxAgeMs) return
    }
    await fetch("/api/supabase/sync/trigger", { method: "POST", credentials: "include" })
  } catch {
    /* ignore */
  }
}
