import { createHash } from 'crypto'
import { SHEET_JSON_EXPORT_URL } from './config'

/** Apps Script peut mettre >10 s (cold start) — timeout Node fetch par défaut trop court. */
export const SHEET_FETCH_TIMEOUT_MS = 60_000

export type SheetJsonFetchResult = {
  json: unknown
  /** Empreinte SHA-256 du corps JSON brut (détection de modification du sheet). */
  contentHash: string
}

export function hashSheetJsonBody(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

export function sheetFetchErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  const cause = e instanceof Error && 'cause' in e ? String(e.cause) : ''
  const combined = `${m} ${cause}`.toLowerCase()
  if (
    combined.includes('fetch failed') ||
    combined.includes('timeout') ||
    combined.includes('connecttimeouterror')
  ) {
    return 'Impossible de joindre le Google Sheet (délai dépassé ou réseau indisponible). Réessayez dans quelques instants.'
  }
  return m
}

async function fetchSheetExportOnce(): Promise<Response> {
  return fetch(SHEET_JSON_EXPORT_URL, {
    cache: 'no-store',
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(SHEET_FETCH_TIMEOUT_MS),
  })
}

/** Récupère le JSON export Google Sheet (Apps Script). Retry x1 en cas d’échec réseau. */
export async function fetchSheetJsonFromGoogle(): Promise<SheetJsonFetchResult> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const r = await fetchSheetExportOnce()
      if (!r.ok) {
        throw new Error(`Script Google : ${r.status} ${r.statusText}`)
      }
      const body = await r.text()
      const contentHash = hashSheetJsonBody(body)
      const json: unknown = JSON.parse(body)
      return { json, contentHash }
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(sheetFetchErrorMessage(lastError))
}
