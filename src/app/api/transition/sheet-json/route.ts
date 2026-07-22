import { NextResponse } from 'next/server'
import { fetchSheetJsonFromGoogle, sheetFetchErrorMessage } from '@/features/sheet-import/fetchSheetJsonFromGoogle'

/** Proxy JSON export Google (évite CORS côté navigateur). Dossier `api/transition` → facile à supprimer (voir features/sheet-import/README). */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const { json } = await fetchSheetJsonFromGoogle()
    return NextResponse.json(json, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json({ error: sheetFetchErrorMessage(e) }, { status: 500 })
  }
}
