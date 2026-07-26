import { NextResponse } from 'next/server'
import { requireApiAdministrator } from '@/lib/auth/require-administrator-api'
import { executeAutomatedTask, loadTaskById } from '@/lib/automated-tasks'
import { reconcileStaleTaskRuns } from '@/lib/automated-tasks/staleRuns'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdministrator()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await ctx.params

  let supabase
  try {
    supabase = createSupabaseServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Service role non configurée' }, { status: 500 })
  }

  const task = await loadTaskById(supabase, id)
  if (!task) {
    return NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 })
  }

  try {
    await reconcileStaleTaskRuns(supabase)
  } catch {
    // ignore — executeAutomatedTask reconcilie aussi pour cette tâche
  }

  try {
    const outcome = await executeAutomatedTask(supabase, task, { force: true })
    return NextResponse.json({ ok: true, outcome })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
