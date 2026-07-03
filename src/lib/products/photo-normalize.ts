const JPEG_QUALITY = 0.85
const SIZE = 100

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossible de charger l’image'))
    }
    img.src = url
  })
}

/** Redimensionne en JPG 100×100, fond blanc, ratio conservé (contain). */
export async function normalizeProductPhotoJpeg(
  source: Blob,
  fileName: string,
): Promise<{ file: File; previewUrl: string }> {
  const img = await loadImageFromBlob(source)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const scale = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  const x = (SIZE - w) / 2
  const y = (SIZE - h) / 2
  ctx.drawImage(img, x, y, w, h)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Conversion JPEG impossible'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })

  const safeName = fileName.toLowerCase().endsWith('.jpg') ? fileName : `${fileName.replace(/\.[^.]+$/, '')}.jpg`
  const file = new File([blob], safeName, { type: 'image/jpeg' })
  return { file, previewUrl: URL.createObjectURL(blob) }
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
