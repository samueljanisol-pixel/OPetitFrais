'use client'

import { useMemo, useState } from 'react'
import { useSyncStatus } from '@/lib/sync/useSyncStatus'

function formatFinishedAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d)
}

/**
 * Dernière ligne de `sync_runs` (import FTP). S’actualise régulièrement côté client.
 */
export default function SyncStatusFooter() {
  const { last: lastSync, error: fetchError } = useSyncStatus(120_000)
  const [syncing, setSyncing] = useState(false)
  const [syncActionError, setSyncActionError] = useState<string | null>(null)

  const triggerSync = async () => {
    setSyncActionError(null)
    setSyncing(true)
    try {
      const res = await fetch('/api/supabase/sync/trigger', {
        method: 'POST',
        credentials: 'include',
      })
      const json = (await res.json().catch(() => null)) as {
        error?: string
        message?: string
        ok?: boolean
      } | null
      if (!res.ok) {
        const msg =
          json?.error ??
          json?.message ??
          (res.status === 401 ? 'Connexion requise pour lancer une synchro.' : `Erreur ${res.status}`)
        setSyncActionError(msg)
        setSyncing(false)
        return
      }
      if (json && json.ok === false && json.message) {
        setSyncActionError(json.message)
        setSyncing(false)
        return
      }
      window.location.reload()
    } catch (e) {
      setSyncActionError(e instanceof Error ? e.message : 'Réseau')
      setSyncing(false)
    }
  }

  const block = useMemo(() => {
    if (fetchError) {
      return { kind: 'error' as const, fetchError }
    }
    if (!lastSync?.finished_at) {
      return { kind: 'empty' as const }
    }
    return {
      kind: 'ok' as const,
      finished: formatFinishedAt(lastSync.finished_at),
      status: lastSync.status,
      message: lastSync.message,
      lastDay: lastSync.last_synced_date,
      processed: lastSync.processed_days,
    }
  }, [lastSync, fetchError])

  return (
    <footer className="mt-12 border-t border-slate-200/90 pt-6 text-xs text-slate-600">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Synchronisation des ventes (FTP → Supabase)
      </div>
      {block.kind === 'error' ? (
        <div className="mt-2 max-w-2xl rounded-lg border border-rose-200 bg-rose-50/90 p-3 text-rose-900">
          <p className="font-semibold">Impossible de lire le statut d’import</p>
          <p className="mt-1 font-mono text-[11px] leading-snug">{block.fetchError}</p>
          <p className="mt-2 text-[11px] text-rose-800/95">
            En production (Vercel), vérifie que <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> et{' '}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> sont bien définis pour ce déploiement — la route{' '}
            <span className="font-mono">/api/supabase/sync/status</span> en a besoin côté serveur (comme{' '}
            <span className="font-mono">/api/supabase/sync/run</span>).
          </p>
        </div>
      ) : block.kind === 'empty' ? (
        <p className="mt-2 max-w-2xl">
          Aucune exécution enregistrée pour l’instant (table <span className="font-mono">sync_runs</span> vide sur ce
          projet).
        </p>
      ) : (
        <div className="mt-2 max-w-2xl space-y-1.5">
          <p>
            <span className="text-slate-500">Dernière fin d’import :</span>{' '}
            <span className="font-semibold text-slate-900">{block.finished}</span>
          </p>
          <p>
            <span className="text-slate-500">Statut :</span>{' '}
            <span
              className={
                block.status === 'success' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'
              }
            >
              {block.status === 'success' ? 'succès' : 'erreur'}
            </span>
            {block.lastDay ? (
              <>
                {' '}
                <span className="text-slate-500">· Dernière journée importée :</span>{' '}
                <span className="font-medium text-slate-800">{block.lastDay}</span>
              </>
            ) : null}
            {block.processed > 0 ? (
              <>
                {' '}
                <span className="text-slate-500">·</span>{' '}
                <span className="font-medium text-slate-800">{block.processed}</span> jour(s) traité(s) sur ce passage
              </>
            ) : null}
          </p>
          {block.status === 'error' && block.message ? (
            <p className="text-rose-800">{block.message}</p>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-4">
        <button
          type="button"
          disabled={syncing || Boolean(fetchError)}
          onClick={() => void triggerSync()}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? 'Synchronisation en cours…' : 'Forcer une synchro maintenant'}
        </button>
        <span className="text-[11px] text-slate-500">
          Import FTP (même logique que le cron), puis rechargement de la page.
        </span>
      </div>
      {syncActionError ? (
        <p className="mt-2 max-w-2xl text-xs font-medium text-rose-700">{syncActionError}</p>
      ) : null}
    </footer>
  )
}
