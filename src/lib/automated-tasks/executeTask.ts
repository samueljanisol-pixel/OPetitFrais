import type { SupabaseClient } from '@supabase/supabase-js'
import { computeNextRunAtForTask } from './schedule'
import { getTaskExecutor } from './registry'
import type { AutomatedTaskRow, TaskExecutionResult } from './types'

export type ExecuteTaskOutcome = {
  taskId: string
  code: string
  runId: string | null
  skipped: boolean
  skipReason?: string
  result?: TaskExecutionResult
}

async function hasRunningRun(supabase: SupabaseClient, taskId: string): Promise<boolean> {
  const { data } = await supabase
    .from('automated_task_runs')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'running')
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function executeAutomatedTask(
  supabase: SupabaseClient,
  task: AutomatedTaskRow,
  options?: { force?: boolean },
): Promise<ExecuteTaskOutcome> {
  const force = options?.force === true

  if (!force && !task.enabled) {
    return {
      taskId: task.id,
      code: task.code,
      runId: null,
      skipped: true,
      skipReason: 'disabled',
    }
  }

  if (!force && (await hasRunningRun(supabase, task.id))) {
    return {
      taskId: task.id,
      code: task.code,
      runId: null,
      skipped: true,
      skipReason: 'already_running',
    }
  }

  const executor = getTaskExecutor(task.code)
  if (!executor) {
    return {
      taskId: task.id,
      code: task.code,
      runId: null,
      skipped: true,
      skipReason: 'unknown_code',
    }
  }

  const startedAt = new Date().toISOString()
  const { data: runRow, error: insertErr } = await supabase
    .from('automated_task_runs')
    .insert({
      task_id: task.id,
      started_at: startedAt,
      status: 'running',
      message: null,
      stats: {},
    } as never)
    .select('id')
    .single()

  if (insertErr || !runRow) {
    throw new Error(insertErr?.message ?? 'Impossible de créer automated_task_runs')
  }

  const runId = (runRow as { id: string }).id
  let execution: TaskExecutionResult

  try {
    execution = await executor(task, { force })
  } catch (e) {
    execution = {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      stats: {},
    }
  }

  const finishedAt = new Date().toISOString()
  const status = execution.ok ? 'success' : 'error'

  await supabase
    .from('automated_task_runs')
    .update({
      finished_at: finishedAt,
      status,
      message: execution.message,
      stats: execution.stats,
    } as never)
    .eq('id', runId)

  const nextRunAt = computeNextRunAtForTask(task, new Date(finishedAt)).toISOString()
  await supabase
    .from('automated_tasks')
    .update({
      last_run_at: finishedAt,
      next_run_at: nextRunAt,
      updated_at: finishedAt,
    } as never)
    .eq('id', task.id)

  return {
    taskId: task.id,
    code: task.code,
    runId,
    skipped: false,
    result: execution,
  }
}

export async function loadTaskByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<AutomatedTaskRow | null> {
  const { data, error } = await supabase
    .from('automated_tasks')
    .select('*')
    .eq('code', code)
    .maybeSingle()
  if (error || !data) return null
  return data as AutomatedTaskRow
}

export async function loadTaskById(
  supabase: SupabaseClient,
  id: string,
): Promise<AutomatedTaskRow | null> {
  const { data, error } = await supabase.from('automated_tasks').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data as AutomatedTaskRow
}
