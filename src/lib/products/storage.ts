import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'product-photos'

export function productPhotoPublicUrl(supabase: SupabaseClient, imagePath: string | null | undefined): string | null {
  if (!imagePath) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(imagePath)
  return data.publicUrl
}

export async function uploadProductPhoto(
  supabase: SupabaseClient,
  productId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const safe = ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  const path = `products/${productId}/${Date.now()}.${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function removeProductPhoto(supabase: SupabaseClient, imagePath: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).remove([imagePath])
  if (error) return { error: error.message }
  return { error: null }
}

export { BUCKET as PRODUCT_PHOTOS_BUCKET }
