'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { buildProductPhotosZip } from '@/lib/products/build-photos-zip'
import { consumeEventStream } from '@/lib/sse/consumeEventStream'
import type { ExportPhotosToFtpResult } from '@/lib/products/importPhotosFromFtp'
import { FTP_ARCHIVE_NAME } from '@/lib/products/product-photo-ftp'

export type FtpExportMode = 'client' | 'server'

export type FtpExportProgress = {
  message: string
}

export async function runProductPhotoFtpExport(
  mode: FtpExportMode,
  onProgress: (p: FtpExportProgress) => void,
): Promise<{ ok: boolean; message: string }> {
  if (mode === 'client') {
    const supabase = createSupabaseBrowserClient()
    onProgress({ message: 'Préparation de l’archive…' })
    const zipBlob = await buildProductPhotosZip(supabase, (p) => {
      if (typeof p.current === 'number' && typeof p.total === 'number') {
        onProgress({ message: `${p.phase} (${p.current}/${p.total})…` })
      } else {
        onProgress({ message: `${p.phase}…` })
      }
    })

    onProgress({ message: 'Envoi vers le FTP…' })
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
    return {
      ok: true,
      message: `Archive envoyée (${j.uploadedBytes ?? 0} octets) : ${FTP_ARCHIVE_NAME}`,
    }
  }

  onProgress({ message: 'Export serveur…' })
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
      if (typeof p.current === 'number' && typeof p.total === 'number') {
        onProgress({ message: `${p.phase ?? 'Export'} (${p.current}/${p.total})…` })
      } else {
        onProgress({ message: `${p.phase ?? 'Export'}…` })
      }
      return
    }
    if (event === 'done' && data && typeof data === 'object') {
      outcome.result = data as ExportPhotosToFtpResult & { archiveName?: string }
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
