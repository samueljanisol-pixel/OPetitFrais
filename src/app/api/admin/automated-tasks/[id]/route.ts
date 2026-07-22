import { NextResponse } from 'next/server'
import { requireApiAdministrator } from '@/lib/auth/require-administrator-api'
import { computeNextRunAtForTask } from '@/lib/automated-tasks'
import type { AutomatedTaskRow, ScheduleKind } from '@/lib/automated-tasks'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PatchBody = {
  enabled?: boolean
  schedule_kind?: ScheduleKind
  interval_minutes?: number | null
  daily_time?: string | null
  config?: Record<string, unknown>
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdministrator()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await ctx.params
  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  let supabase
  try {
    supabase = createSupabaseServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Service role non configurée' }, { status: 500 })
  }

  const { data: existing, error: loadErr } = await supabase
    .from('automated_tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 })
  }

  const current = existing as AutomatedTaskRow
  const next: AutomatedTaskRow = {
    ...current,
    enabled: body.enabled ?? current.enabled,
    schedule_kind: body.schedule_kind ?? current.schedule_kind,
    interval_minutes:
      body.interval_minutes !== undefined ? body.interval_minutes : current.interval_minutes,
    daily_time: body.daily_time !== undefined ? body.daily_time : current.daily_time,
    config: body.config !== undefined ? { ...current.config, ...body.config } : current.config,
  }

  if (next.schedule_kind === 'interval' && (!next.interval_minutes || next.interval_minutes < 1)) {
    return NextResponse.json({ error: 'interval_minutes requis (>= 1) pour schedule_kind=interval' }, { status: 400 })
  }
  if (next.schedule_kind === 'daily' && !next.daily_time) {
    return NextResponse.json({ error: 'daily_time requis pour schedule_kind=daily' }, { status: 400 })
  }

  const nextRunAt = computeNextRunAtForTask(next).toISOString()
  const updatedAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('automated_tasks')
    .update({
      enabled: next.enabled,
      schedule_kind: next.schedule_kind,
      interval_minutes: next.interval_minutes,
      daily_time: next.daily_time,
      config: next.config,
      next_run_at: nextRunAt,
      updated_at: updatedAt,
    } as never)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data })
}
