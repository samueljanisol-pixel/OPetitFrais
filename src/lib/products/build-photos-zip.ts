import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'
import { productPhotoArchiveFileName } from '@/lib/products/product-photo-ftp'
import { productPhotoPublicUrl } from '@/lib/products/storage'
import { normalizeProductPhotoJpeg } from '@/lib/products/photo-normalize'

export type PhotoZipProgress = {
  phase: string
  current?: number
  total?: number
  percent?: number
}

type ProductPhotoRow = {
  id: string
  code: string
  image_path: string | null
}

export async function buildProductPhotosZip(
  supabase: SupabaseClient,
  onProgress?: (p: PhotoZipProgress) => void,
): Promise<Blob> {
  onProgress?.({ phase: 'Chargement des produits' })

  const { data: products, error } = await supabase
    .from('product')
    .select('id, code, image_path')
    .not('image_path', 'is', null)
    .order('code')

  if (error) throw new Error(error.message)
  const rows = (products ?? []) as ProductPhotoRow[]
  if (rows.length === 0) throw new Error('Aucune photo produit à exporter.')

  const zip = new JSZip()
  let index = 0

  for (const row of rows) {
    index += 1
    onProgress?.({ phase: 'Préparation des images', current: index, total: rows.length })

    const archiveName = productPhotoArchiveFileName(row.code)
    if (!archiveName || !row.image_path) continue

    const url = productPhotoPublicUrl(supabase, row.image_path)
    if (!url) continue

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Téléchargement impossible pour ${row.code}`)
    }
    const raw = await res.blob()
    const { file } = await normalizeProductPhotoJpeg(raw, archiveName)
    const buf = await file.arrayBuffer()
    zip.file(archiveName, buf)
  }

  onProgress?.({ phase: 'Création de l’archive', percent: 0 })
  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      onProgress?.({
        phase: 'Création de l’archive',
        percent: Math.round(metadata.percent),
      })
    },
  )
}
