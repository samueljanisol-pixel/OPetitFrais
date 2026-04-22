import { NextRequest, NextResponse } from 'next/server'
import { buildSheetExportPayload } from '@/features/sheet-import/buildSheetExportJson'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Export produits (JSON, mêmes clés que l’import Google Sheet).
 * Accès : `GET /api/transition/sheet-json-export?token=VOTRE_SECRET` (défini par `SHEET_JSON_EXPORT_TOKEN` côté serveur).
 * S’affiche dans l’onglet du navigateur (comme le proxy import) ; pas de téléchargement forcé. Autre machine : curl, script, signet.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.SHEET_JSON_EXPORT_TOKEN
  if (!expected || !expected.trim()) {
    return NextResponse.json(
      { error: 'Export désactivé : variable d’environnement SHEET_JSON_EXPORT_TOKEN non définie côté serveur.' },
      { status: 503 },
    )
  }
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  if (token.length === 0 || token !== expected) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let supabase
  try {
    supabase = createSupabaseServiceRoleClient()
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: m }, { status: 503 })
  }

  try {
    const rows = await buildSheetExportPayload(supabase)
    const body = JSON.stringify(rows, null, 2)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: m }, { status: 500 })
  }
}
