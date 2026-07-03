import {
  readPhotoBgModelReady,
  writePhotoBgModelReady,
} from '@/lib/products/photo-bg-preference'

export type BgRemovalProgress = {
  phase: 'model' | 'process'
  key?: string
  current?: number
  total?: number
  /** true si le modèle est en cours de téléchargement (pas encore en cache). */
  downloading?: boolean
}

export async function removeProductBackground(
  source: Blob,
  onProgress?: (p: BgRemovalProgress) => void,
): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal')
  const modelWasReady = readPhotoBgModelReady()

  const result = await removeBackground(source, {
    model: 'isnet_quint8',
    output: {
      format: 'image/png',
      quality: 0.9,
    },
    progress: (key, current, total) => {
      const downloading = !modelWasReady && total > 0 && current < total
      if (!modelWasReady && total > 0 && current >= total) {
        writePhotoBgModelReady()
      }
      onProgress?.({
        phase: downloading ? 'model' : 'process',
        key,
        current,
        total,
        downloading,
      })
    },
  })

  writePhotoBgModelReady()
  return result
}
