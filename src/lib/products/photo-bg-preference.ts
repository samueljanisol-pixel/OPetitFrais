const STORAGE_KEY = 'product-photo-bg-removal'

export type PhotoBgPreference = 'enabled' | 'disabled'

export function readPhotoBgPreference(): PhotoBgPreference {
  if (typeof window === 'undefined') return 'disabled'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'enabled' ? 'enabled' : 'disabled'
  } catch {
    return 'disabled'
  }
}

export function writePhotoBgPreference(value: PhotoBgPreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* quota / mode privé */
  }
}
