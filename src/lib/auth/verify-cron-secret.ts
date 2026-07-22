/** Vérifie le secret cron (Vercel Cron, Raspberry Pi, etc.). */
export function verifyCronSecret(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const url = new URL(req.url)
  const auth = req.headers.get('authorization')
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : null
  const token = url.searchParams.get('token') || req.headers.get('x-cron-secret') || bearer
  const expected = process.env.CRON_SECRET || process.env.SYNC_TOKEN
  if (!expected) {
    return {
      ok: false,
      status: 401,
      error: 'Définis CRON_SECRET ou SYNC_TOKEN côté serveur.',
    }
  }
  if (!token || token !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}
