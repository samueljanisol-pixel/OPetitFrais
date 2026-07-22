'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Typography,
} from '@mui/material'
import type { AutomatedTaskRunRow, AutomatedTaskRow, ScheduleKind } from '@/lib/automated-tasks'
import { describeNextRunAt } from '@/lib/automated-tasks/schedule'
import {
  importFieldsFromTaskConfig,
  SHEET_IMPORT_FIELD_KEYS,
  SHEET_IMPORT_FIELD_LABELS,
  type SheetImportFields,
} from '@/features/sheet-import/sheet-import-fields'

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

function statNumber(stats: Record<string, unknown>, key: string): number | null {
  const v = stats[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function errorSamplesFromStats(stats: Record<string, unknown>): string[] {
  const raw = stats.errorSamples
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

function runSummaryShort(run: AutomatedTaskRunRow): string {
  const stats = run.stats ?? {}
  if (stats.skippedUnchanged === true) return 'Sheet inchangé'
  const parts: string[] = []
  const created = statNumber(stats, 'created')
  const updated = statNumber(stats, 'updated')
  const processedDays = statNumber(stats, 'processedDays')
  const applyErrors = statNumber(stats, 'applyErrors')
  const parseErrors = statNumber(stats, 'parseErrors')
  if (created != null && created > 0) parts.push(`${created} créé(s)`)
  if (updated != null && updated > 0) parts.push(`${updated} modifié(s)`)
  if (processedDays != null && processedDays > 0) parts.push(`${processedDays} jour(s)`)
  const errCount = (applyErrors ?? 0) + (parseErrors ?? 0)
  if (errCount > 0) parts.push(`${errCount} erreur(s)`)
  if (parts.length > 0) return parts.join(' · ')
  return run.status === 'success' ? 'OK' : '—'
}

function importFieldsSummary(fields: SheetImportFields): string {
  const selected = SHEET_IMPORT_FIELD_KEYS.filter((k) => fields[k])
  if (selected.length === 0) return 'Aucun — nouveaux produits seulement'
  if (selected.length === SHEET_IMPORT_FIELD_KEYS.length) return 'Tous les champs'
  if (selected.length <= 4) {
    return selected.map((k) => SHEET_IMPORT_FIELD_LABELS[k]).join(', ')
  }
  return `${selected.length} champs cochés`
}

function ImportFieldsDialog({
  open,
  fields,
  onClose,
  onChange,
}: {
  open: boolean
  fields: SheetImportFields
  onClose: () => void
  onChange: (fields: SheetImportFields) => void
}) {
  const setAll = (checked: boolean) => {
    onChange(
      SHEET_IMPORT_FIELD_KEYS.reduce(
        (acc, key) => {
          acc[key] = checked
          return acc
        },
        {} as SheetImportFields,
      ),
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Produits existants</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Champs éligibles pour les produits déjà en base — seules les valeurs réellement modifiées
          par rapport à la base sont importées. Un nouveau produit est toujours créé avec toutes les
          colonnes. Sans case cochée, seuls les nouveaux produits sont importés.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Button type="button" size="small" variant="text" onClick={() => setAll(true)} sx={{ textTransform: 'none', px: 1 }}>
            Tout cocher
          </Button>
          <Button type="button" size="small" variant="text" onClick={() => setAll(false)} sx={{ textTransform: 'none', px: 1 }}>
            Tout décocher
          </Button>
        </Box>
        <FormGroup>
          {SHEET_IMPORT_FIELD_KEYS.map((key) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={fields[key]}
                  onChange={(e) => onChange({ ...fields, [key]: e.target.checked })}
                  size="small"
                />
              }
              label={SHEET_IMPORT_FIELD_LABELS[key]}
            />
          ))}
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function HistoryRunsDialog({
  open,
  onClose,
  runs,
  loading,
  onDetails,
}: {
  open: boolean
  onClose: () => void
  runs: AutomatedTaskRunRow[]
  loading: boolean
  onDetails: (run: AutomatedTaskRunRow) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Historique récent</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Chargement…</Typography>
          </Box>
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
                  <th className="py-1 pr-2">Résumé</th>
                  <th className="py-1 w-24" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDt(run.started_at)}</td>
                    <td className="py-1.5 pr-2">{statusLabel(run.status)}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{runSummaryShort(run)}</td>
                    <td className="py-1.5">
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        sx={{ textTransform: 'none', py: 0.25, px: 1 }}
                        onClick={() => onDetails(run)}
                      >
                        Détails
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function RunDetailsDialog({
  run,
  open,
  onClose,
}: {
  run: AutomatedTaskRunRow | null
  open: boolean
  onClose: () => void
}) {
  if (!run) return null
  const stats = run.stats ?? {}
  const errors = errorSamplesFromStats(stats)
  const statRows: Array<{ label: string; value: string }> = []
  const created = statNumber(stats, 'created')
  const updated = statNumber(stats, 'updated')
  const skipped = statNumber(stats, 'skipped')
  const processedDays = statNumber(stats, 'processedDays')
  const parseErrors = statNumber(stats, 'parseErrors')
  const applyErrors = statNumber(stats, 'applyErrors')
  if (created != null) statRows.push({ label: 'Créés', value: String(created) })
  if (updated != null) statRows.push({ label: 'Modifiés', value: String(updated) })
  if (skipped != null) statRows.push({ label: 'Ignorés', value: String(skipped) })
  if (processedDays != null) statRows.push({ label: 'Jours traités', value: String(processedDays) })
  if (parseErrors != null) statRows.push({ label: 'Erreurs analyse', value: String(parseErrors) })
  if (applyErrors != null) statRows.push({ label: 'Erreurs import', value: String(applyErrors) })
  if (stats.skippedUnchanged === true) statRows.push({ label: 'Sheet', value: 'Inchangé' })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Détails de l&apos;exécution</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          <strong>Début :</strong> {formatDt(run.started_at)}
          {run.finished_at ? (
            <>
              <br />
              <strong>Fin :</strong> {formatDt(run.finished_at)}
            </>
          ) : null}
          <br />
          <strong>Statut :</strong> {statusLabel(run.status)}
        </Typography>
        {run.message ? (
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {run.message}
          </Typography>
        ) : null}
        {statRows.length > 0 ? (
          <Box component="ul" sx={{ m: 0, pl: 2.5, mb: errors.length > 0 ? 2 : 0 }}>
            {statRows.map((row) => (
              <Typography key={row.label} component="li" variant="body2">
                {row.label} : {row.value}
              </Typography>
            ))}
          </Box>
        ) : null}
        {errors.length > 0 ? (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Erreurs ({errors.length}
              {(applyErrors ?? 0) + (parseErrors ?? 0) > errors.length ? ', extrait' : ''})
            </Typography>
            <Box
              component="ul"
              sx={{
                m: 0,
                pl: 2.5,
                maxHeight: 280,
                overflow: 'auto',
                fontSize: '0.8125rem',
                color: 'error.main',
              }}
            >
              {errors.map((err, i) => (
                <Typography key={`${i}-${err.slice(0, 24)}`} component="li" variant="body2" sx={{ mb: 0.5 }}>
                  {err}
                </Typography>
              ))}
            </Box>
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  )
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
  const [importFields, setImportFields] = useState<SheetImportFields>(() =>
    importFieldsFromTaskConfig(task.config),
  )
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runs, setRuns] = useState<AutomatedTaskRunRow[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [detailsRun, setDetailsRun] = useState<AutomatedTaskRunRow | null>(null)
  const [importFieldsOpen, setImportFieldsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    setEnabled(task.enabled)
    setScheduleKind(task.schedule_kind)
    setIntervalMinutes(task.interval_minutes ?? 60)
    setDailyTime(task.daily_time ? String(task.daily_time).slice(0, 5) : '06:00')
    setImportFields(importFieldsFromTaskConfig(task.config))
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
    if (historyOpen) {
      void loadRuns()
    }
  }, [historyOpen, loadRuns, task.lastRun?.id])

  const save = async () => {
    setSaving(true)
    setLocalErr(null)
    try {
      const config =
        task.code === 'sheet_import'
          ? { importFields }
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
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Produits existants
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {importFieldsSummary(importFields)}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            color="success"
            sx={{ textTransform: 'none' }}
            onClick={() => setImportFieldsOpen(true)}
          >
            Choisir les champs…
          </Button>
        </Box>
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
        {task.lastRun ? (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            <strong>Résumé :</strong> {runSummaryShort(task.lastRun)}{' '}
            <Button
              size="small"
              variant="text"
              color="success"
              sx={{ textTransform: 'none', minWidth: 0, p: 0, verticalAlign: 'baseline' }}
              onClick={() => setDetailsRun(task.lastRun)}
            >
              Détails
            </Button>
          </Typography>
        ) : null}
      </Box>

      <Button
        variant="text"
        size="small"
        color="success"
        sx={{ textTransform: 'none', px: 0, mb: 1 }}
        onClick={() => setHistoryOpen(true)}
      >
        Voir l&apos;historique récent
      </Button>

      <RunDetailsDialog
        run={detailsRun}
        open={detailsRun != null}
        onClose={() => setDetailsRun(null)}
      />
      {task.code === 'sheet_import' ? (
        <ImportFieldsDialog
          open={importFieldsOpen}
          fields={importFields}
          onClose={() => setImportFieldsOpen(false)}
          onChange={setImportFields}
        />
      ) : null}
      <HistoryRunsDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        runs={runs}
        loading={runsLoading}
        onDetails={(run) => {
          setHistoryOpen(false)
          setDetailsRun(run)
        }}
      />
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
