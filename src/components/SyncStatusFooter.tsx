'use client'

import { useMemo } from 'react'
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
  const lastSync = useSyncStatus(120_000)

  const block = useMemo(() => {
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
  }, [lastSync])

  return (
    <footer className="mt-12 border-t border-slate-200/90 pt-6 text-xs text-slate-600">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Synchronisation des ventes (FTP → Supabase)
      </div>
      {block.kind === 'empty' ? (
        <p className="mt-2 max-w-2xl">
          Aucune exécution enregistrée pour l’instant (table <span className="font-mono">sync_runs</span> vide ou
          inaccessible).
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
    </footer>
  )
}
