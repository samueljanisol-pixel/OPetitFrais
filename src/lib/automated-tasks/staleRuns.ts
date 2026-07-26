import type { SupabaseClient } from '@supabase/supabase-js'

/** Au-delà de ce délai, un run « running » est considéré bloqué (timeout serverless, crash, etc.). */
export const STALE_TASK_RUN_MS = 20 * 60 * 1000

const STALE_MESSAGE = 'Interrompu (délai dépassé ou arrêt du processus).'

export async function reconcileStaleTaskRuns(
  supabase: SupabaseClient,
  options?: { staleAfterMs?: number; taskId?: string },
): Promise<number> {
  const staleAfterMs = options?.staleAfterMs ?? STALE_TASK_RUN_MS
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString()

  let query = supabase
    .from('automated_task_runs')
    .select('id')
    .eq('status', 'running')
    .lt('started_at', cutoff)

  if (options?.taskId) {
    query = query.eq('task_id', options.taskId)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const ids = (data ?? []).map((row) => (row as { id: string }).id).filter(Boolean)
  if (ids.length === 0) {
    return 0
  }

  const finishedAt = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('automated_task_runs')
    .update({
      finished_at: finishedAt,
      status: 'error',
      message: STALE_MESSAGE,
      stats: { stale: true, staleReason: 'timeout' },
    } as never)
    .in('id', ids)

  if (updateErr) {
    throw new Error(updateErr.message)
  }

  return ids.length
}

export function isRunLikelyStale(
  run: { status: string; started_at: string },
  staleAfterMs: number = STALE_TASK_RUN_MS,
): boolean {
  if (run.status !== 'running') return false
  return Date.now() - new Date(run.started_at).getTime() > staleAfterMs
}
