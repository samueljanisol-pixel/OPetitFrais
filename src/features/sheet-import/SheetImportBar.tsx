'use client'

import { useState } from 'react'
import { Button, CircularProgress, Typography } from '@mui/material'
import { SHEET_DB_EXPORT_PATH, SHEET_IMPORT_ENABLED, SHEET_JSON_EXPORT_URL } from './config'
import { applySheetImport } from './applySheetImport'
import { parseSheetJsonToRows } from './mapSheetRow'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Props = { onDone: () => void; canWriteProducts?: boolean }

export function SheetImportBar({ onDone, canWriteProducts = false }: Props) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ftpLoading, setFtpLoading] = useState(false)
  const [ftpMsg, setFtpMsg] = useState<string | null>(null)
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

  const runFtpPhotos = async () => {
    if (!canWriteProducts) return
    if (
      !window.confirm(
        'Importer les photos depuis le FTP (dossier img_produits / Photos_Produits.rar) ? Les fichiers nommés par code (ex. 12.jpg) seront associés aux produits.',
      )
    )
      return
    setFtpLoading(true)
    setFtpMsg(null)
    try {
      const r = await fetch('/api/products/import-photos-ftp', {
        method: 'POST',
        credentials: 'include',
      })
      const j: unknown = await r.json()
      const data422 =
        typeof j === 'object' &&
        j !== null &&
        ('uploaded' in j || 'extractedFiles' in j || 'errors' in j)

      if (!r.ok && !data422) {
        const err =
          typeof j === 'object' && j !== null && 'error' in j && typeof (j as { error?: unknown }).error === 'string'
            ? (j as { error: string }).error
            : `Échec (${r.status})`
        setFtpMsg(err)
        return
      }
      const data = j as {
        uploaded?: number
        downloadedBytes?: number
        extractedFiles?: number
        skippedNoProduct?: number
        skippedBadName?: number
        removedOld?: number
        errors?: string[]
      }
      const parts = [
        `Téléchargé ${data.downloadedBytes ?? 0} octets, ${data.extractedFiles ?? 0} fichier(s) dans l’archive.`,
        `Envoyés : ${data.uploaded ?? 0}, ignorés (pas de produit) : ${data.skippedNoProduct ?? 0}, noms invalides : ${data.skippedBadName ?? 0}, anciennes images supprimées : ${data.removedOld ?? 0}.`,
        ...(Array.isArray(data.errors) ? data.errors.slice(0, 30) : []),
      ]
      if (Array.isArray(data.errors) && data.errors.length > 30) {
        parts.push(`… et ${data.errors.length - 30} autre(s) message(s).`)
      }
      setFtpMsg(parts.join(' '))
      onDone()
    } catch (e) {
      setFtpMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setFtpLoading(false)
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
          disabled={loading || ftpLoading}
          onClick={() => void run()}
          sx={{ textTransform: 'none' }}
        >
          {loading ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
          Importer depuis Google Sheet
        </Button>
        {canWriteProducts ? (
          <Button
            type="button"
            size="small"
            variant="outlined"
            color="warning"
            disabled={loading || ftpLoading}
            onClick={() => void runFtpPhotos()}
            sx={{ textTransform: 'none' }}
          >
            {ftpLoading ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
            Importer photos (FTP)
          </Button>
        ) : null}
      </div>
      {msg ? <p className="text-amber-900/90 leading-snug whitespace-pre-wrap">{msg}</p> : null}
      {ftpMsg ? <p className="text-amber-900/95 leading-snug whitespace-pre-wrap border-t border-amber-200/80 pt-2 mt-1">{ftpMsg}</p> : null}
    </div>
  )
}
