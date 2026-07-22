'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Typography,
} from '@mui/material'
import type { AutomatedTaskRunRow, AutomatedTaskRow, ScheduleKind } from '@/lib/automated-tasks'
import { describeNextRunAt } from '@/lib/automated-tasks/schedule'

type TaskWithLastRun = AutomatedTaskRow & { lastRun: AutomatedTaskRunRow | null }

const INTERVAL_OPTIONS = [
  { value: 15, label: 'Toutes les 15 minutes' },
  { value: 30, label: 'Toutes les 30 minutes' },
  { value: 60, label: 'Toutes les heures' },
  { value: 120, label: 'Toutes les 2 heures' },
  { value: 360, label: 'Toutes les 6 heures' },
  { value: 1440, label: 'Une fois par jour (intervalle 24 h)' },
] as const

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function statusLabel(status: string | undefined): string {
  if (status === 'success') return 'Succès'
  if (status === 'error') return 'Erreur'
  if (status === 'running') return 'En cours'
  return '—'
}

function TaskCard({
  task,
  onRefresh,
}: {
  task: TaskWithLastRun
  onRefresh: () => void
}) {
  const [enabled, setEnabled] = useState(task.enabled)
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(task.schedule_kind)
  const [intervalMinutes, setIntervalMinutes] = useState(task.interval_minutes ?? 60)
  const [dailyTime, setDailyTime] = useState(
    task.daily_time ? String(task.daily_time).slice(0, 5) : '06:00',
  )
  const [updateFields, setUpdateFields] = useState<'all' | 'new_only'>(
    task.config.updateFields === 'new_only' ? 'new_only' : 'all',
  )
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runs, setRuns] = useState<AutomatedTaskRunRow[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)

  useEffect(() => {
    setEnabled(task.enabled)
    setScheduleKind(task.schedule_kind)
    setIntervalMinutes(task.interval_minutes ?? 60)
    setDailyTime(task.daily_time ? String(task.daily_time).slice(0, 5) : '06:00')
    setUpdateFields(task.config.updateFields === 'new_only' ? 'new_only' : 'all')
  }, [task])

  const loadRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const res = await fetch(`/api/admin/automated-tasks/${task.id}/runs?limit=10`, {
        credentials: 'include',
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        setRuns((j as { runs?: AutomatedTaskRunRow[] }).runs ?? [])
      }
    } finally {
      setRunsLoading(false)
    }
  }, [task.id])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns, task.lastRun?.id])

  const save = async () => {
    setSaving(true)
    setLocalErr(null)
    try {
      const config =
        task.code === 'sheet_import'
          ? { updateFields }
          : task.config
      const body: Record<string, unknown> = {
        enabled,
        schedule_kind: scheduleKind,
        config,
      }
      if (scheduleKind === 'interval') {
        body.interval_minutes = intervalMinutes
        body.daily_time = null
      } else {
        body.daily_time = `${dailyTime}:00`
        body.interval_minutes = null
      }
      const res = await fetch(`/api/admin/automated-tasks/${task.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? 'Enregistrement impossible')
      }
      onRefresh()
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setLocalErr(null)
    try {
      const res = await fetch(`/api/admin/automated-tasks/${task.id}/run`, {
        method: 'POST',
        credentials: 'include',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? 'Exécution impossible')
      }
      onRefresh()
      await loadRuns()
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setRunning(false)
    }
  }

  const nextRun = describeNextRunAt(task, new Date(), formatDt)

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'slate.900' }}>
            {task.label}
          </Typography>
          {task.description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 560 }}>
              {task.description}
            </Typography>
          ) : null}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontFamily: 'monospace' }}>
            {task.code}
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(_, v) => setEnabled(v)}
              color="success"
            />
          }
          label={enabled ? 'Actif' : 'Inactif'}
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 2 }}>
        <FormControl size="small" fullWidth>
          <InputLabel id={`${task.id}-schedule-kind`}>Type de répétition</InputLabel>
          <Select
            labelId={`${task.id}-schedule-kind`}
            label="Type de répétition"
            value={scheduleKind}
            onChange={(e) => setScheduleKind(e.target.value as ScheduleKind)}
          >
            <MenuItem value="interval">Intervalle</MenuItem>
            <MenuItem value="daily">Quotidien (heure UTC)</MenuItem>
          </Select>
        </FormControl>

        {scheduleKind === 'interval' ? (
          <FormControl size="small" fullWidth>
            <InputLabel id={`${task.id}-interval`}>Fréquence</InputLabel>
            <Select
              labelId={`${task.id}-interval`}
              label="Fréquence"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            >
              {INTERVAL_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <FormControl size="small" fullWidth>
            <InputLabel shrink htmlFor={`${task.id}-daily-time`}>
              Heure (UTC)
            </InputLabel>
            <input
              id={`${task.id}-daily-time`}
              type="time"
              value={dailyTime}
              onChange={(e) => setDailyTime(e.target.value)}
              className="mt-4 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </FormControl>
        )}
      </Box>

      {task.code === 'sheet_import' ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, maxWidth: 560 }}>
          En planification automatique, l&apos;import ne s&apos;exécute que si le fichier export a changé depuis le
          dernier import. « Lancer maintenant » force l&apos;import même sans modification.
        </Typography>
      ) : null}

      {task.code === 'sheet_import' ? (
        <FormControl size="small" fullWidth sx={{ mb: 2, maxWidth: 420 }}>
          <InputLabel id={`${task.id}-update-fields`}>Produits existants</InputLabel>
          <Select
            labelId={`${task.id}-update-fields`}
            label="Produits existants"
            value={updateFields}
            onChange={(e) => setUpdateFields(e.target.value as 'all' | 'new_only')}
          >
            <MenuItem value="all">Mettre à jour tous les champs</MenuItem>
            <MenuItem value="new_only">Créer les nouveaux seulement</MenuItem>
          </Select>
        </FormControl>
      ) : null}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Button variant="contained" color="success" disabled={saving} onClick={() => void save()} sx={{ textTransform: 'none' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button variant="outlined" color="success" disabled={running} onClick={() => void runNow()} sx={{ textTransform: 'none' }}>
          {running ? 'Exécution…' : 'Lancer maintenant'}
        </Button>
      </Box>

      {localErr ? (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {localErr}
        </Typography>
      ) : null}

      <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1, fontSize: '0.875rem' }}>
        <Typography variant="body2">
          <strong>Prochaine exécution :</strong>{' '}
          <span style={{ color: nextRun.isOverdue ? '#b45309' : undefined }}>{nextRun.label}</span>
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          <strong>Dernière exécution :</strong> {formatDt(task.lastRun?.finished_at ?? task.last_run_at)}
          {task.lastRun ? (
            <>
              {' '}
              · <strong>{statusLabel(task.lastRun.status)}</strong>
            </>
          ) : null}
        </Typography>
        {task.lastRun?.message ? (
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
            {task.lastRun.message}
          </Typography>
        ) : null}
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Historique récent
      </Typography>
      {runsLoading ? (
        <CircularProgress size={20} />
      ) : runs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Aucune exécution enregistrée.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-2">Début</th>
                <th className="py-1 pr-2">Statut</th>
                <th className="py-1">Message</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatDt(run.started_at)}</td>
                  <td className="py-1.5 pr-2">{statusLabel(run.status)}</td>
                  <td className="py-1.5 text-slate-600">{run.message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </Paper>
  )
}

export default function AutomatedTasksAdminPanel() {
  const [tasks, setTasks] = useState<TaskWithLastRun[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/automated-tasks', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? 'Chargement impossible')
      }
      setTasks((j as { tasks?: TaskWithLastRun[] }).tasks ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
        <CircularProgress size={22} />
        <Typography variant="body2">Chargement des tâches…</Typography>
      </Box>
    )
  }

  if (err) {
    return (
      <Typography variant="body2" color="error">
        {err}
      </Typography>
    )
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
        Planification des imports automatiques. Le cron Vercel appelle{' '}
        <span className="font-mono text-xs">/api/automated-tasks/tick</span> toutes les 5 minutes en{' '}
        <strong>production</strong> et exécute les tâches actives dont l&apos;échéance est dépassée. En{' '}
        <strong>développement local</strong>, le cron ne tourne pas : utilisez « Lancer maintenant » ou appelez
        manuellement le tick. Les horaires quotidiens sont en UTC.
      </Typography>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onRefresh={() => void load()} />
      ))}
    </Box>
  )
}
