import { NextResponse } from 'next/server'
import { requireApiAdministrator } from '@/lib/auth/require-administrator-api'
import type { AutomatedTaskRunRow } from '@/lib/automated-tasks'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdministrator()
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await ctx.params
  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20) || 20))

  let supabase
  try {
    supabase = createSupabaseServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Service role non configurée' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('automated_task_runs')
    .select('*')
    .eq('task_id', id)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ runs: (data ?? []) as AutomatedTaskRunRow[] })
}
