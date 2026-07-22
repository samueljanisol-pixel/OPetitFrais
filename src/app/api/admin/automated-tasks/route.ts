import { NextResponse } from 'next/server'
import { requireApiAdministrator } from '@/lib/auth/require-administrator-api'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { AutomatedTaskRunRow, AutomatedTaskRow } from '@/lib/automated-tasks'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const gate = await requireApiAdministrator()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let supabase
  try {
    supabase = createSupabaseServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Service role non configurée' }, { status: 500 })
  }

  const { data: tasks, error } = await supabase
    .from('automated_tasks')
    .select('*')
    .order('code')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (tasks ?? []) as AutomatedTaskRow[]
  const taskIds = rows.map((t) => t.id)
  const lastRunsByTask = new Map<string, AutomatedTaskRunRow>()

  if (taskIds.length > 0) {
    const { data: runs } = await supabase
      .from('automated_task_runs')
      .select('*')
      .in('task_id', taskIds)
      .order('started_at', { ascending: false })

    for (const run of (runs ?? []) as AutomatedTaskRunRow[]) {
      if (!lastRunsByTask.has(run.task_id)) {
        lastRunsByTask.set(run.task_id, run)
      }
    }
  }

  return NextResponse.json({
    tasks: rows.map((task) => ({
      ...task,
      lastRun: lastRunsByTask.get(task.id) ?? null,
    })),
  })
}
