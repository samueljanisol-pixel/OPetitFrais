import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret'
import { tickDueTasks } from '@/lib/automated-tasks'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  return POST(req)
}

export async function POST(req: Request) {
  const gate = verifyCronSecret(req)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const supabase = createSupabaseServiceRoleClient()
    const result = await tickDueTasks(supabase)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
