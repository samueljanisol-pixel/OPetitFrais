export type BgRemovalProgress = {
  phase: 'model' | 'process'
  key?: string
  current?: number
  total?: number
}

export async function removeProductBackground(
  source: Blob,
  onProgress?: (p: BgRemovalProgress) => void,
): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal')
  return removeBackground(source, {
    model: 'isnet_quint8',
    output: {
      format: 'image/png',
      quality: 0.9,
    },
    progress: (key, current, total) => {
      onProgress?.({
        phase: 'model',
        key,
        current,
        total,
      })
    },
  })
}
