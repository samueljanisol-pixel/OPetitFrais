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
        <Typography variant="body2" className="!font-medium">
          Import Google Sheet (transition) — colonnes : Actif, Code, Nom, Prix, UdV, Catégorie, Fournisseur, Arabe
        </Typography>
      </div>
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
          Importer depuis l’export JSON
        </Button>
        <a
          href={SHEET_JSON_EXPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-amber-900 underline"
        >
          Ouvrir l’export JSON (nouvel onglet)
        </a>
      </div>
      <p className="text-xs text-amber-900/80 leading-snug">
        <span className="font-semibold">Export base (même format que l’import, récupérable depuis une autre machine) :</span>{' '}
        définir <code className="rounded bg-amber-100/80 px-1">SHEET_JSON_EXPORT_TOKEN</code> côté serveur (même valeur que le paramètre{' '}
        <code className="rounded bg-amber-100/80 px-1">token</code> de l’URL), puis{' '}
        <code className="rounded bg-amber-100/80 px-1 break-all">
          GET https://exemple.com{SHEET_DB_EXPORT_PATH}?token=…
        </code>
        . Réponse : JSON (fichier <code className="rounded bg-amber-100/80 px-1">produits-export.json</code>).
      </p>
      {msg ? <p className="text-amber-900/90 leading-snug whitespace-pre-wrap">{msg}</p> : null}
    </div>
  )
}
