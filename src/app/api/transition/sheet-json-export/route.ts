import { NextRequest, NextResponse } from 'next/server'
import { buildSheetExportPayload } from '@/features/sheet-import/buildSheetExportJson'
import { fetchProductLastModified } from '@/features/sheet-import/productLastModified'
import { authorizeSheetDbExport } from '@/features/sheet-import/sheetDbExportAuth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Export produits JSON (équivalent fichier Google Sheet).
 *
 * - Liste : `GET /api/transition/sheet-json-export?token=…`
 *   colonnes code, Actif, Nom, Prix, PrixAchat, Fournisseur, Catégorie, SousCatégorie, Arabe, UdV
 * - Date dernière modif : `GET …?format=date&token=…` → `{ "lastModified": "YYYYMMDDHHmmss" }`
 *   (même forme que le script Google `?format=date`)
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeSheetDbExport(req)
  if (!auth.ok) return auth.response

  let supabase
  try {
    supabase = createSupabaseServiceRoleClient()
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: m }, { status: 503 })
  }

  const format = (req.nextUrl.searchParams.get('format') ?? '').trim().toLowerCase()

  try {
    if (format === 'date') {
      const payload = await fetchProductLastModified(supabase)
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

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
