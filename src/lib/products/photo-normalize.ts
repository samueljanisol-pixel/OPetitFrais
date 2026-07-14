const JPEG_QUALITY = 0.85
const SIZE = 100
const ALPHA_THRESHOLD = 12
/** Marge autour du sujet détouré avant recadrage. */
const CROP_PADDING_RATIO = 0.03
/** Marge dans le cadre final 100×100 (le produit remplit l’espace restant). */
const FRAME_MARGIN_RATIO = 0.03

type DrawableSource = HTMLImageElement | HTMLCanvasElement

function sourceWidth(source: DrawableSource): number {
  return 'naturalWidth' in source ? source.naturalWidth : source.width
}

function sourceHeight(source: DrawableSource): number {
  return 'naturalHeight' in source ? source.naturalHeight : source.height
}

function normalizeRotationDeg(deg: number): number {
  const n = ((deg % 360) + 360) % 360
  return n === 0 || n === 90 || n === 180 || n === 270 ? n : 0
}

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

function rotateImageToCanvas(img: HTMLImageElement, rotationDeg: number): HTMLCanvasElement {
  const deg = normalizeRotationDeg(rotationDeg)
  const canvas = document.createElement('canvas')
  if (deg === 0) {
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponible')
    ctx.drawImage(img, 0, 0)
    return canvas
  }

  const quarter = deg === 90 || deg === 270
  canvas.width = quarter ? img.naturalHeight : img.naturalWidth
  canvas.height = quarter ? img.naturalWidth : img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  return canvas
}

type CropBounds = { x: number; y: number; w: number; h: number }

/** Cadre du sujet visible (pixels non transparents) pour centrer après détourage. */
function getSubjectBounds(source: DrawableSource): CropBounds | null {
  const width = sourceWidth(source)
  const height = sourceHeight(source)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(source, 0, 0)
  const { data } = ctx.getImageData(0, 0, width, height)

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        found = true
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (!found) return null

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const padX = Math.round(bw * CROP_PADDING_RATIO)
  const padY = Math.round(bh * CROP_PADDING_RATIO)

  return {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    w: Math.min(width - Math.max(0, minX - padX), bw + padX * 2),
    h: Math.min(height - Math.max(0, minY - padY), bh + padY * 2),
  }
}

function hasTransparentPixels(source: DrawableSource): boolean {
  const width = sourceWidth(source)
  const height = sourceHeight(source)
  const sampleW = Math.min(width, 200)
  const sampleH = Math.min(height, 200)
  const canvas = document.createElement('canvas')
  canvas.width = sampleW
  canvas.height = sampleH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(source, 0, 0, sampleW, sampleH)
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true
  }
  return false
}

export type NormalizePhotoOptions = {
  rotationDeg?: number
}

/** Redimensionne en JPG 100×100, fond blanc ; centre le sujet détouré. */
export async function normalizeProductPhotoJpeg(
  source: Blob,
  fileName: string,
  options: NormalizePhotoOptions = {},
): Promise<{ file: File; previewUrl: string }> {
  const img = await loadImageFromBlob(source)
  const rotated = rotateImageToCanvas(img, options.rotationDeg ?? 0)

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const transparent = hasTransparentPixels(rotated)
  const bounds = transparent ? getSubjectBounds(rotated) : null

  const srcX = bounds?.x ?? 0
  const srcY = bounds?.y ?? 0
  const srcW = bounds?.w ?? rotated.width
  const srcH = bounds?.h ?? rotated.height

  const innerMax = SIZE * (1 - 2 * FRAME_MARGIN_RATIO)
  const scale = Math.min(innerMax / srcW, innerMax / srcH)
  const w = srcW * scale
  const h = srcH * scale
  const x = (SIZE - w) / 2
  const y = (SIZE - h) / 2

  ctx.drawImage(rotated, srcX, srcY, srcW, srcH, x, y, w, h)

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
