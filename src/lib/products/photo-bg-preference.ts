const STORAGE_KEY = 'product-photo-bg-removal'
const MODEL_READY_KEY = 'product-photo-bg-model-ready'

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

/** Modèle IA déjà téléchargé et mis en cache sur cet appareil. */
export function readPhotoBgModelReady(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(MODEL_READY_KEY) === '1'
  } catch {
    return false
  }
}

export function writePhotoBgModelReady(): void {
  try {
    localStorage.setItem(MODEL_READY_KEY, '1')
  } catch {
    /* quota / mode privé */
  }
}
