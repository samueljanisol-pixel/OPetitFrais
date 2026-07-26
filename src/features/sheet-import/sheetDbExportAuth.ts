import { NextRequest, NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/require-permission-api'

/** Autorise l’export BDD : token (`?token=`) ou session `produits.read`. */
export async function authorizeSheetDbExport(
  req: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const expected = (
    process.env.SHEET_JSON_EXPORT_TOKEN ??
    process.env.NEXT_PUBLIC_SHEET_JSON_EXPORT_TOKEN ??
    ''
  ).trim()
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  const tokenOk = Boolean(expected && token.length > 0 && token === expected)

  if (tokenOk) return { ok: true }

  if (token.length > 0 || !expected) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: expected
            ? 'Non autorisé (token invalide).'
            : 'Export désactivé : SHEET_JSON_EXPORT_TOKEN / NEXT_PUBLIC_SHEET_JSON_EXPORT_TOKEN non défini.',
        },
        { status: expected ? 401 : 503 },
      ),
    }
  }

  const gate = await requireApiPermission('produits.read')
  if (!gate.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: gate.error }, { status: gate.status }),
    }
  }
  return { ok: true }
}
