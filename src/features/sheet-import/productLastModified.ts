import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultTimeZone } from '@/i18n/config'

/**
 * Formate une date comme l’export Google Sheet `?format=date` :
 * `YYYYMMDDHHmmss` (fuseau app, Africa/Casablanca).
 */
export function formatSheetLastModified(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: defaultTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '00'

  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}${get('month')}${get('day')}${hour}${get('minute')}${get('second')}`
}

/** `max(product.updated_at)` → `{ lastModified: "YYYYMMDDHHmmss" }` (même forme que le script Google). */
export async function fetchProductLastModified(supabase: SupabaseClient): Promise<{
  lastModified: string
}> {
  const { data, error } = await supabase
    .from('product')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const raw = data?.updated_at
  const date = typeof raw === 'string' && raw.length > 0 ? new Date(raw) : new Date(0)
  if (Number.isNaN(date.getTime())) {
    throw new Error('updated_at produit invalide')
  }
  return { lastModified: formatSheetLastModified(date) }
}
