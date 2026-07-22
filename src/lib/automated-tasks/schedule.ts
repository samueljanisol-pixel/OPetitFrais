import type { AutomatedTaskRow, ScheduleKind } from './types'

function parseDailyTimeUtc(time: string): { hours: number; minutes: number } {
  const parts = time.trim().split(':')
  const hours = Number(parts[0] ?? 0)
  const minutes = Number(parts[1] ?? 0)
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  }
}

/** Prochaine exécution (UTC) à partir de `from` (défaut : maintenant). */
export function computeNextRunAt(
  scheduleKind: ScheduleKind,
  intervalMinutes: number | null,
  dailyTime: string | null,
  from: Date = new Date(),
): Date {
  if (scheduleKind === 'interval') {
    const mins = Math.max(1, intervalMinutes ?? 60)
    return new Date(from.getTime() + mins * 60_000)
  }

  const { hours, minutes } = parseDailyTimeUtc(dailyTime ?? '06:00')
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hours, minutes, 0, 0),
  )
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

export function computeNextRunAtForTask(task: AutomatedTaskRow, from: Date = new Date()): Date {
  return computeNextRunAt(task.schedule_kind, task.interval_minutes, task.daily_time, from)
}

export function isTaskDue(task: AutomatedTaskRow, now: Date = new Date()): boolean {
  if (!task.enabled) return false
  if (!task.next_run_at) return true
  return new Date(task.next_run_at).getTime() <= now.getTime()
}

export type NextRunDescription = {
  isOverdue: boolean
  /** Texte prêt pour l’UI (heure locale). */
  label: string
}

/** Libellé « prochaine exécution » — distingue échéance passée (en attente du cron) vs future. */
export function describeNextRunAt(
  task: Pick<AutomatedTaskRow, 'enabled' | 'next_run_at'>,
  now: Date = new Date(),
  formatLocal: (iso: string) => string = (iso) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso)),
): NextRunDescription {
  if (!task.enabled) {
    return { isOverdue: false, label: '— (tâche inactive)' }
  }
  if (!task.next_run_at) {
    return { isOverdue: true, label: 'Dès que possible (aucune échéance enregistrée)' }
  }
  const dueMs = new Date(task.next_run_at).getTime()
  if (dueMs <= now.getTime()) {
    return {
      isOverdue: true,
      label: `En attente — échue depuis ${formatLocal(task.next_run_at)} (prochain tick cron ≤ 5 min en prod)`,
    }
  }
  return { isOverdue: false, label: formatLocal(task.next_run_at) }
}
