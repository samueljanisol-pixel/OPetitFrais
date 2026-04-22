import { NextResponse } from 'next/server'
import { SHEET_JSON_EXPORT_URL } from '@/features/sheet-import/config'

/** Proxy JSON export Google (évite CORS côté navigateur). Dossier `api/transition` → facile à supprimer (voir features/sheet-import/README). */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const r = await fetch(SHEET_JSON_EXPORT_URL, {
      cache: 'no-store',
      next: { revalidate: 0 },
    })
    if (!r.ok) {
      return NextResponse.json(
        { error: `Script Google : ${r.status} ${r.statusText}` },
        { status: 502 },
      )
    }
    const data: unknown = await r.json()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: m }, { status: 500 })
  }
}
