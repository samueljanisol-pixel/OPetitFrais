import type { SupabaseClient } from '@supabase/supabase-js'
import { isTaskDue } from './schedule'
import { executeAutomatedTask, type ExecuteTaskOutcome } from './executeTask'
import type { AutomatedTaskRow } from './types'

export type TickDueTasksResult = {
  checked: number
  executed: number
  skipped: number
  outcomes: ExecuteTaskOutcome[]
}

export async function tickDueTasks(supabase: SupabaseClient): Promise<TickDueTasksResult> {
  const now = new Date()
  const { data, error } = await supabase
    .from('automated_tasks')
    .select('*')
    .eq('enabled', true)
    .order('code')

  if (error) {
    throw new Error(error.message)
  }

  const tasks = (data ?? []) as AutomatedTaskRow[]
  const dueTasks = tasks.filter((t) => isTaskDue(t, now))
  const outcomes: ExecuteTaskOutcome[] = []

  for (const task of dueTasks) {
    const outcome = await executeAutomatedTask(supabase, task)
    outcomes.push(outcome)
  }

  return {
    checked: tasks.length,
    executed: outcomes.filter((o) => !o.skipped).length,
    skipped: outcomes.filter((o) => o.skipped).length,
    outcomes,
  }
}
