'use client'

import { useCallback, useState } from 'react'
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  LinearProgress,
  Typography,
} from '@mui/material'
import { SHEET_IMPORT_ENABLED } from './config'
import { applySheetImport } from './applySheetImport'
import { parseSheetJsonToRows } from './mapSheetRow'
import {
  DEFAULT_SHEET_IMPORT_FIELDS,
  SHEET_IMPORT_FIELD_KEYS,
  SHEET_IMPORT_FIELD_LABELS,
  type SheetImportFieldKey,
  type SheetImportFields,
} from './sheet-import-fields'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { consumeEventStream } from '@/lib/sse/consumeEventStream'
import type { ImportPhotosFromFtpResult } from '@/lib/products/importPhotosFromFtp'
import { FTP_ARCHIVE_NAME } from '@/lib/products/product-photo-ftp'
import { runProductPhotoFtpExport } from '@/lib/products/run-product-photo-ftp-export'

function formatImportResult(
  created: number,
  updated: number,
  skipped: number,
  parseErrs: string[],
  applyErrs: string[],
  selectedFields: SheetImportFields,
): string {
  const lines: string[] = [
    `Nouveaux produits créés : ${created}`,
    `Produits modifiés : ${updated}`,
  ]
  if (skipped > 0) {
    lines.push(`Lignes ignorées (existant sans champ coché) : ${skipped}`)
  }
  if (!Object.values(selectedFields).some(Boolean)) {
    lines.push('(Aucun champ coché — seuls les nouveaux produits ont été traités.)')
  }
  const allErrs = [...parseErrs, ...applyErrs]
  if (allErrs.length > 0) {
    lines.push('', `Erreurs (${allErrs.length}) :`, ...allErrs.map(e => `• ${e}`))
  }
  return lines.join('\n')
}

function formatFtpImportResult(data: ImportPhotosFromFtpResult): string {
  const parts = [
    `Téléchargé ${data.downloadedBytes ?? 0} octets, ${data.extractedFiles ?? 0} fichier(s) dans l’archive.`,
    `Envoyés : ${data.uploaded ?? 0}, ignorés (pas de produit) : ${data.skippedNoProduct ?? 0}, noms invalides : ${data.skippedBadName ?? 0}, anciennes images supprimées : ${data.removedOld ?? 0}.`,
    ...(Array.isArray(data.errors) ? data.errors.slice(0, 30) : []),
  ]
  if (Array.isArray(data.errors) && data.errors.length > 30) {
    parts.push(`… et ${data.errors.length - 30} autre(s) message(s).`)
  }
  return parts.join(' ')
}

function formatFtpProgress(phase: string, current?: number, total?: number): string {
  if (typeof current === 'number' && typeof total === 'number' && total > 0) {
    return `${phase} (${current}/${total})…`
  }
  return `${phase}…`
}

type Props = { onDone: () => void; canWriteProducts?: boolean }

export function SheetImportBar({ onDone, canWriteProducts = false }: Props) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<number | null>(null)
  const [importProgressMsg, setImportProgressMsg] = useState<string | null>(null)
  const [ftpLoading, setFtpLoading] = useState(false)
  const [ftpMsg, setFtpMsg] = useState<string | null>(null)
  const [ftpExportLoading, setFtpExportLoading] = useState(false)
  const [ftpExportMsg, setFtpExportMsg] = useState<string | null>(null)
  const [ftpExportProgress, setFtpExportProgress] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [fields, setFields] = useState<SheetImportFields>({ ...DEFAULT_SHEET_IMPORT_FIELDS })

  const setField = useCallback((key: SheetImportFieldKey, checked: boolean) => {
    setFields((prev) => ({ ...prev, [key]: checked }))
  }, [])

  const setAllFields = useCallback((checked: boolean) => {
    setFields(
      SHEET_IMPORT_FIELD_KEYS.reduce(
        (acc, key) => {
          acc[key] = checked
          return acc
        },
        {} as SheetImportFields,
      ),
    )
  }, [])

  const runImport = async (selectedFields: SheetImportFields) => {
    setLoading(true)
    setMsg(null)
    setImportProgress(0)
    setImportProgressMsg('Récupération du fichier…')
    const supabase = createSupabaseBrowserClient()
    try {
      const r = await fetch('/api/transition/sheet-json', { cache: 'no-store' })
      setImportProgress(8)
      setImportProgressMsg('Analyse des lignes…')
      let j: unknown
      try {
        j = await r.json()
      } catch {
        setMsg(`Échec de lecture du JSON (${r.status}). Réessayez.`)
        return
      }
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
      setImportProgress(12)
      setImportProgressMsg('Préparation des référentiels…')
      const { created, updated, skipped, errors: applyErrs } = await applySheetImport(
        supabase,
        rows,
        selectedFields,
        (progress) => {
          if (progress.phase === 'prepare') {
            setImportProgress(15)
            setImportProgressMsg('Préparation des référentiels…')
            return
          }
          const pct = 15 + Math.round((progress.current / Math.max(progress.total, 1)) * 85)
          setImportProgress(Math.min(100, pct))
          setImportProgressMsg(`Import des produits (${progress.current}/${progress.total})…`)
        },
      )
      setImportProgress(100)
      setImportProgressMsg('Import terminé.')
      setMsg(formatImportResult(created, updated, skipped, parseErrs, applyErrs, selectedFields))
      if (created > 0 || updated > 0) {
        onDone()
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setImportProgress(null)
      setImportProgressMsg(null)
    }
  }

  const onConfirmImport = () => {
    setDialogOpen(false)
    void runImport(fields)
  }

  const runFtpPhotos = async () => {
    if (!canWriteProducts) return
    if (
      !window.confirm(
        'Importer les photos depuis le FTP (dossier img_produits / Photos_Produits.zip) ? Les fichiers nommés par code (ex. 12.jpg) seront associés aux produits.',
      )
    )
      return
    setFtpLoading(true)
    setFtpMsg('Démarrage…')
    try {
      const r = await fetch('/api/products/import-photos-ftp', {
        method: 'POST',
        credentials: 'include',
      })
      const contentType = r.headers.get('content-type') ?? ''
      if (!r.ok && contentType.includes('application/json')) {
        const j: unknown = await r.json()
        const err =
          typeof j === 'object' && j !== null && 'error' in j && typeof (j as { error?: unknown }).error === 'string'
            ? (j as { error: string }).error
            : `Échec (${r.status})`
        setFtpMsg(err)
        return
      }
      if (!contentType.includes('text/event-stream')) {
        setFtpMsg(`Réponse inattendue (${r.status}).`)
        return
      }

      const outcome: { result: ImportPhotosFromFtpResult | null } = { result: null }
      await consumeEventStream(r, (event, data) => {
        if (event === 'progress' && data && typeof data === 'object' && 'phase' in data) {
          const p = data as { phase?: string; current?: number; total?: number }
          setFtpMsg(formatFtpProgress(String(p.phase ?? 'Import'), p.current, p.total))
          return
        }
        if (event === 'done' && data && typeof data === 'object') {
          outcome.result = data as ImportPhotosFromFtpResult
          return
        }
        if (event === 'error' && data && typeof data === 'object' && 'error' in data) {
          const err = (data as { error?: unknown }).error
          setFtpMsg(typeof err === 'string' ? err : 'Erreur import photos')
        }
      })

      const result = outcome.result
      if (result) {
        setFtpMsg(formatFtpImportResult(result))
        if (result.uploaded > 0 || result.ok) {
          onDone()
        }
      } else if (!r.ok) {
        setFtpMsg(`Échec (${r.status})`)
      }
    } catch (e) {
      setFtpMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setFtpLoading(false)
    }
  }

  const runFtpPhotosExport = async () => {
    if (!canWriteProducts) return
    if (
      !window.confirm(
        `Exporter les photos Supabase vers le FTP (${FTP_ARCHIVE_NAME}) ? L’archive existante sera remplacée.`,
      )
    )
      return
    setFtpExportLoading(true)
    setFtpExportMsg('Démarrage…')
    setFtpExportProgress(0)
    try {
      const outcome = await runProductPhotoFtpExport('client', (p) => {
        setFtpExportMsg(p.message)
        setFtpExportProgress(p.percent)
      })
      setFtpExportMsg(outcome.message)
      if (outcome.ok) setFtpExportProgress(100)
    } catch (e) {
      setFtpExportMsg(e instanceof Error ? e.message : String(e))
      setFtpExportProgress(null)
    } finally {
      setFtpExportLoading(false)
    }
  }

  if (!SHEET_IMPORT_ENABLED) return null

  return (
    <>
      <div className="mb-4 flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="small"
            variant="contained"
            color="warning"
            disabled={loading || ftpLoading || ftpExportLoading}
            onClick={() => {
              setFields({ ...DEFAULT_SHEET_IMPORT_FIELDS })
              setDialogOpen(true)
            }}
            sx={{ textTransform: 'none' }}
          >
            {loading ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
            Importer depuis Google Sheet
          </Button>
          {canWriteProducts ? (
            <>
            <Button
              type="button"
              size="small"
              variant="outlined"
              color="warning"
              disabled={loading || ftpLoading || ftpExportLoading}
              onClick={() => void runFtpPhotos()}
              sx={{ textTransform: 'none' }}
            >
              {ftpLoading ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
              Importer photos (FTP)
            </Button>
            <Button
              type="button"
              size="small"
              variant="outlined"
              color="warning"
              disabled={loading || ftpLoading || ftpExportLoading}
              onClick={() => void runFtpPhotosExport()}
              sx={{ textTransform: 'none' }}
            >
              {ftpExportLoading ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
              Exporter photos (FTP)
            </Button>
            </>
          ) : null}
        </div>
        {msg ? <p className="text-amber-900/90 leading-snug whitespace-pre-wrap">{msg}</p> : null}
        {loading && importProgress != null ? (
          <div className="border-t border-amber-200/80 pt-2 mt-1">
            <LinearProgress variant="determinate" value={importProgress} color="warning" />
            <p className="text-xs text-amber-900/80 mt-1">
              {importProgressMsg ?? `${importProgress} %`}
            </p>
          </div>
        ) : null}
        {ftpMsg ? (
          <p className="text-amber-900/95 leading-snug whitespace-pre-wrap border-t border-amber-200/80 pt-2 mt-1">
            Import : {ftpMsg}
          </p>
        ) : null}
        {ftpExportMsg ? (
          <p className="text-amber-900/95 leading-snug whitespace-pre-wrap border-t border-amber-200/80 pt-2 mt-1">
            Export : {ftpExportMsg}
          </p>
        ) : null}
        {ftpExportLoading && ftpExportProgress != null ? (
          <div className="border-t border-amber-200/80 pt-2 mt-1">
            <LinearProgress variant="determinate" value={ftpExportProgress} color="warning" />
            <p className="text-xs text-amber-900/80 mt-1">{ftpExportProgress} %</p>
          </div>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onClose={() => !loading && setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>Import Google Sheet</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Correspondance produit par <strong>Code</strong> ou par <strong>Nom</strong> si le code feuille est vide.
            Les champs cochés définissent les colonnes éligibles pour les <strong>produits existants</strong> ;
            seules les valeurs <strong>modifiées</strong> par rapport à la base sont importées. Un{' '}
            <strong>nouveau produit</strong> est toujours créé avec <strong>toutes</strong> les colonnes de la feuille.
            Sans case cochée, seuls les <strong>nouveaux</strong> produits sont importés.
          </Typography>
          <div className="mb-2 flex flex-wrap gap-2">
            <Button type="button" size="small" variant="text" onClick={() => setAllFields(true)} sx={{ textTransform: 'none', px: 1 }}>
              Tout cocher
            </Button>
            <Button type="button" size="small" variant="text" onClick={() => setAllFields(false)} sx={{ textTransform: 'none', px: 1 }}>
              Tout décocher
            </Button>
          </div>
          <FormGroup>
            {SHEET_IMPORT_FIELD_KEYS.map((key) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={fields[key]}
                    onChange={(e) => setField(key, e.target.checked)}
                    size="small"
                  />
                }
                label={SHEET_IMPORT_FIELD_LABELS[key]}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={loading} sx={{ textTransform: 'none' }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={loading}
            onClick={onConfirmImport}
            sx={{ textTransform: 'none' }}
          >
            Importer
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
