export type AutomatedTaskCode = 'sheet_import' | 'ftp_sync'

export type ScheduleKind = 'interval' | 'daily'

export type AutomatedTaskRunStatus = 'running' | 'success' | 'error'

export type SheetImportTaskConfig = {
  updateFields?: 'all' | 'new_only'
  /** Empreinte du dernier import réussi (SHA-256 du JSON export). */
  lastImportContentHash?: string
  lastImportAt?: string
}

export type AutomatedTaskRow = {
  id: string
  code: AutomatedTaskCode
  label: string
  description: string | null
  enabled: boolean
  schedule_kind: ScheduleKind
  interval_minutes: number | null
  daily_time: string | null
  config: SheetImportTaskConfig & Record<string, unknown>
  last_run_at: string | null
  next_run_at: string | null
  updated_at: string
}

export type AutomatedTaskRunRow = {
  id: string
  task_id: string
  started_at: string
  finished_at: string | null
  status: AutomatedTaskRunStatus
  message: string | null
  stats: Record<string, unknown>
}

export type TaskExecutionOptions = {
  /** Ignore la détection « sheet inchangé » (lancement manuel admin). */
  force?: boolean
}

export type TaskExecutionResult = {
  ok: boolean
  message: string | null
  stats: Record<string, unknown>
}

export type TaskExecutor = (
  task: AutomatedTaskRow,
  options?: TaskExecutionOptions,
) => Promise<TaskExecutionResult>
