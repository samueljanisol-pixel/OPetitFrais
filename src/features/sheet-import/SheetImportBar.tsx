'use client'

import { useState } from 'react'
import { Button, CircularProgress, Typography } from '@mui/material'
import { SHEET_DB_EXPORT_PATH, SHEET_IMPORT_ENABLED, SHEET_JSON_EXPORT_URL } from './config'
import { applySheetImport } from './applySheetImport'
import { parseSheetJsonToRows } from './mapSheetRow'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Props = { onDone: () => void }

export function SheetImportBar({ onDone }: Props) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!SHEET_IMPORT_ENABLED) return null

  const run = async () => {
    if (!window.confirm("Importer l’export Google Sheet (fusion par Code ou par Nom si code vide) ?")) return
    setLoading(true)
    setMsg(null)
    const supabase = createSupabaseBrowserClient()
    try {
      const r = await fetch('/api/transition/sheet-json', { cache: 'no-store' })
      const j: unknown = await r.json()
      if (!r.ok) {
        setMsg(typeof (j as { error?: string }).error === 'string' ? (j as { error: string }).error : 'Échec du proxy JSON')
        return
      }
      const { rows, errors: parseErrs } = parseSheetJsonToRows(j)
      if (rows.length === 0) {
        setMsg(`Aucune ligne valide. ${parseErrs.length ? parseErrs.join(' ') : 'Tableau JSON vide ?'}`)
        onDone()
        return
      }
      const { created, updated, errors: applyErrs } = await applySheetImport(supabase, rows)
      const parts = [
        `Créés : ${created}, mis à jour : ${updated}.`,
        ...parseErrs,
        ...applyErrs,
      ].filter(Boolean)
      setMsg(parts.join(' '))
      onDone()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="small"
          variant="contained"
          color="warning"
          disabled={loading}
          onClick={() => void run()}
          sx={{ textTransform: 'none' }}
        >
          {loading ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
          Importer depuis Google Sheet
        </Button>
      </div>
      {msg ? <p className="text-amber-900/90 leading-snug whitespace-pre-wrap">{msg}</p> : null}
    </div>
  )
}
