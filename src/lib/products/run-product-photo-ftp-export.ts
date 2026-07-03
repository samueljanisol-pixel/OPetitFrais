'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { buildProductPhotosZip } from '@/lib/products/build-photos-zip'
import { consumeEventStream } from '@/lib/sse/consumeEventStream'
import type { ExportPhotosToFtpResult } from '@/lib/products/importPhotosFromFtp'
import { FTP_ARCHIVE_NAME } from '@/lib/products/product-photo-ftp'

export type FtpExportMode = 'client' | 'server'

export type FtpExportProgress = {
  message: string
  percent: number
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function clientZipPercent(phase: string, current?: number, total?: number, zipPercent?: number): number {
  if (phase === 'Chargement des produits') return 5
  if (phase === 'Préparation des images' && typeof current === 'number' && typeof total === 'number' && total > 0) {
    return clampPercent(10 + (current / total) * 65)
  }
  if (phase === 'Création de l’archive' && typeof zipPercent === 'number') {
    return clampPercent(78 + (zipPercent / 100) * 14)
  }
  if (phase === 'Envoi vers le FTP') return 96
  return 0
}

function serverExportPercent(phase: string, current?: number, total?: number): number {
  if (typeof current === 'number' && typeof total === 'number' && total > 0) {
    if (phase === 'Préparation des images') {
      return clampPercent(15 + (current / total) * 60)
    }
    return clampPercent((current / total) * 90)
  }
  if (phase === 'Chargement des produits') return 8
  if (phase === 'Création de l’archive') return 82
  if (phase === 'Connexion FTP') return 90
  if (phase === 'Envoi de l’archive') return 96
  return 0
}

export async function runProductPhotoFtpExport(
  mode: FtpExportMode,
  onProgress: (p: FtpExportProgress) => void,
): Promise<{ ok: boolean; message: string }> {
  if (mode === 'client') {
    const supabase = createSupabaseBrowserClient()
    onProgress({ message: 'Chargement des produits…', percent: 5 })
    const zipBlob = await buildProductPhotosZip(supabase, (p) => {
      const percent = clientZipPercent(p.phase, p.current, p.total, p.percent)
      if (typeof p.current === 'number' && typeof p.total === 'number') {
        onProgress({ message: `${p.phase} (${p.current}/${p.total})…`, percent })
      } else if (typeof p.percent === 'number') {
        onProgress({ message: `${p.phase} (${p.percent} %)…`, percent })
      } else {
        onProgress({ message: `${p.phase}…`, percent })
      }
    })

    onProgress({ message: 'Envoi vers le FTP…', percent: 96 })
    const form = new FormData()
    form.append('archive', zipBlob, FTP_ARCHIVE_NAME)
    const r = await fetch('/api/products/export-photos-ftp', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    const j = (await r.json()) as ExportPhotosToFtpResult & { error?: string }
    if (!r.ok) {
      return { ok: false, message: typeof j.error === 'string' ? j.error : `Échec (${r.status})` }
    }
    if (!j.ok) {
      return { ok: false, message: j.errors?.join(' ') || 'Export échoué' }
    }
    onProgress({ message: 'Export terminé', percent: 100 })
    return {
      ok: true,
      message: `Archive envoyée (${j.uploadedBytes ?? 0} octets) : ${FTP_ARCHIVE_NAME}`,
    }
  }

  onProgress({ message: 'Export serveur…', percent: 2 })
  const r = await fetch('/api/products/export-photos-ftp', {
    method: 'POST',
    credentials: 'include',
  })
  const contentType = r.headers.get('content-type') ?? ''
  if (!r.ok && contentType.includes('application/json')) {
    const j: unknown = await r.json()
    const msg =
      typeof j === 'object' && j !== null && 'error' in j && typeof (j as { error?: unknown }).error === 'string'
        ? (j as { error: string }).error
        : `Échec (${r.status})`
    return { ok: false, message: msg }
  }
  if (!contentType.includes('text/event-stream')) {
    return { ok: false, message: `Réponse inattendue (${r.status}).` }
  }

  const outcome: {
    result: (ExportPhotosToFtpResult & { archiveName?: string }) | null
    error: string | null
  } = { result: null, error: null }

  await consumeEventStream(r, (event, data) => {
    if (event === 'progress' && data && typeof data === 'object' && 'phase' in data) {
      const p = data as { phase?: string; current?: number; total?: number }
      const phase = String(p.phase ?? 'Export')
      const percent = serverExportPercent(phase, p.current, p.total)
      if (typeof p.current === 'number' && typeof p.total === 'number') {
        onProgress({ message: `${phase} (${p.current}/${p.total})…`, percent })
      } else {
        onProgress({ message: `${phase}…`, percent })
      }
      return
    }
    if (event === 'done' && data && typeof data === 'object') {
      outcome.result = data as ExportPhotosToFtpResult & { archiveName?: string }
      onProgress({ message: 'Export terminé', percent: 100 })
    }
    if (event === 'error' && data && typeof data === 'object' && 'error' in data) {
      const errMsg = (data as { error?: unknown }).error
      outcome.error = typeof errMsg === 'string' ? errMsg : 'Erreur export'
    }
  })

  if (outcome.error) return { ok: false, message: outcome.error }
  const finalResult = outcome.result
  if (!finalResult) return { ok: false, message: 'Export interrompu.' }
  if (finalResult.ok) {
    return {
      ok: true,
      message: `Archive ${finalResult.archiveName ?? FTP_ARCHIVE_NAME} envoyée (${finalResult.uploadedBytes ?? 0} octets, ${finalResult.fileCount ?? 0} image(s)).`,
    }
  }
  return { ok: false, message: finalResult.errors?.join(' ') || 'Export échoué' }
}
