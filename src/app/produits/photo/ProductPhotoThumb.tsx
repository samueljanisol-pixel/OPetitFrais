'use client'

import { useEffect, useMemo, useState } from 'react'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PRODUCT_PHOTOS_BUCKET, productPhotoPublicUrl } from '@/lib/products/storage'

type Props = {
  supabase: SupabaseClient
  imagePath: string | null | undefined
  size?: number
  className?: string
}

/**
 * Affiche une vignette produit. Sous COEP (page /produits/photo), les URLs Supabase
 * directes peuvent être bloquées : on charge via fetch → blob URL (same-origin).
 */
export default function ProductPhotoThumb({
  supabase,
  imagePath,
  size = 44,
  className,
}: Props) {
  const publicUrl = useMemo(
    () => productPhotoPublicUrl(supabase, imagePath),
    [supabase, imagePath],
  )
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!imagePath) {
      setSrc(null)
      setFailed(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    setSrc(null)

    const load = async () => {
      const { data, error } = await supabase.storage.from(PRODUCT_PHOTOS_BUCKET).download(imagePath)
      if (cancelled) return
      if (error || !data) {
        if (publicUrl) {
          setSrc(publicUrl)
        } else {
          setFailed(true)
        }
        return
      }
      objectUrl = URL.createObjectURL(data)
      setSrc(objectUrl)
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [supabase, imagePath, publicUrl])

  if (!imagePath || failed) {
    return <PhotoCameraIcon sx={{ fontSize: size * 0.45, color: 'text.disabled' }} />
  }

  if (!src) {
    return (
      <span
        className={className}
        style={{ width: size, height: size, display: 'inline-block' }}
        aria-hidden
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      crossOrigin="anonymous"
      className={className ?? 'h-full w-full object-contain'}
      onError={() => setFailed(true)}
    />
  )
}
