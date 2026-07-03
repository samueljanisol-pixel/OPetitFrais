export const FTP_REMOTE_DIR = '/img_produits'
export const FTP_ARCHIVE_NAME = 'Photos_Produits.zip'

/** Clé produit normalisée (6 chiffres) pour association archive ↔ base. */
export function normalizeProductCodeKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return String(n).padStart(6, '0')
}

/** Nom de fichier dans l’archive FTP (ex. code `000012` → `12.jpg`). */
export function productPhotoArchiveFileName(code: string): string | null {
  const digits = code.replace(/\D/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return `${n}.jpg`
}
