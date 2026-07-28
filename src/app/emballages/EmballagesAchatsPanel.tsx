'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, TextField, Typography } from '@mui/material'
import FormDialog from '@/lib/mui/FormDialog'
import AppLink from '@/components/AppLink'
import { useTranslations } from 'next-intl'
import type { EmballageAchatFicheRow, EmballageVendeurRow } from '@/lib/emballages/types'

type Props = {
  canWrite: boolean
  onError: (msg: string | null) => void
}

function formatMAD(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export default function EmballagesAchatsPanel({ canWrite, onError }: Props) {
  const t = useTranslations('backoffice.emballages')
  const tCommon = useTranslations('common')

  const [achats, setAchats] = useState<EmballageAchatFicheRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterStatut, setFilterStatut] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [dateAchat, setDateAchat] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [vendeurId, setVendeurId] = useState('')
  const [vendeurs, setVendeurs] = useState<EmballageVendeurRow[]>([])
  const [creating, setCreating] = useState(false)

  const loadVendeurs = useCallback(async () => {
    try {
      const res = await fetch('/api/emballages/vendeurs', { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { error?: string; vendeurs?: EmballageVendeurRow[] }
      if (res.ok) setVendeurs(j.vendeurs ?? [])
    } catch {
      /* optional */
    }
  }, [])

  const loadAchats = useCallback(async () => {
    setLoading(true)
    onError(null)
    try {
      const params = new URLSearchParams()
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (filterStatut) params.set('statut', filterStatut)
      const qs = params.toString()
      const res = await fetch(`/api/emballages/achats${qs ? `?${qs}` : ''}`, { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { error?: string; achats?: EmballageAchatFicheRow[] }
      if (!res.ok) throw new Error(j.error ?? t('errors.loadFailed'))
      setAchats(j.achats ?? [])
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setLoading(false)
    }
  }, [filterFrom, filterStatut, filterTo, onError, t, tCommon])

  useEffect(() => {
    void loadAchats()
  }, [loadAchats])

  useEffect(() => {
    void loadVendeurs()
  }, [loadVendeurs])

  const createAchat = async () => {
    setCreating(true)
    onError(null)
    try {
      const res = await fetch('/api/emballages/achats', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_achat: dateAchat,
          note: note.trim() || null,
          vendeur_id: vendeurId.trim() || null,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; achat?: EmballageAchatFicheRow }
      if (!res.ok) throw new Error(j.error ?? t('errors.saveFailed'))
      setCreateOpen(false)
      if (j.achat?.id) {
        window.location.href = `/emballages/achats/${j.achat.id}`
        return
      }
      await loadAchats()
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Typography variant="body2" className="!text-slate-600">
        {t('achatsHint')}
      </Typography>

      <Paper className="!p-3">
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label={t('filters.from')}
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label={t('filters.to')}
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('columns.statut')}</InputLabel>
            <Select
              value={filterStatut}
              label={t('columns.statut')}
              onChange={(e) => setFilterStatut(e.target.value)}
            >
              <MenuItem value="">
                <em>{t('filters.allStatuts')}</em>
              </MenuItem>
              <MenuItem value="ouvert">{t('statut.ouvert')}</MenuItem>
              <MenuItem value="cloture">{t('statut.cloture')}</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={() => void loadAchats()} sx={{ textTransform: 'none' }}>
            {tCommon('refresh')}
          </Button>
          {canWrite ? (
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                setDateAchat(new Date().toISOString().slice(0, 10))
                setNote('')
                setVendeurId('')
                setCreateOpen(true)
              }}
              sx={{ textTransform: 'none' }}
            >
              {t('newAchat')}
            </Button>
          ) : null}
        </div>
      </Paper>

      {loading ? (
        <Typography className="!text-slate-600">{tCommon('loading')}</Typography>
      ) : achats.length === 0 ? (
        <Typography className="!text-slate-600">{t('achatsEmpty')}</Typography>
      ) : (
        <Paper className="!overflow-x-auto !p-2">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-2 py-1.5 font-medium">{t('columns.date')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.statut')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.vendeur')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('columns.ligneCount')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('columns.montant')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.note')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {achats.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(row.date_achat)}</td>
                  <td className="px-2 py-1.5">
                    {row.statut === 'ouvert' ? t('statut.ouvert') : t('statut.cloture')}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.ref_supplier_vendeur?.label ?? t('vendeurOptional')}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row.ligne_count ?? 0}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatMAD(row.total ?? 0)} {tCommon('currency')}
                  </td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate">{row.note ?? tCommon('emDash')}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      component={AppLink}
                      href={`/emballages/achats/${row.id}`}
                      size="small"
                      sx={{ textTransform: 'none' }}
                    >
                      {tCommon('open')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Paper>
      )}

      <FormDialog
        open={createOpen}
        onClose={() => {
          if (!creating) setCreateOpen(false)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('newAchat')}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <TextField
              label={t('columns.date')}
              type="date"
              value={dateAchat}
              onChange={(e) => setDateAchat(e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t('columns.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>{t('columns.vendeur')}</InputLabel>
              <Select
                value={vendeurId}
                label={t('columns.vendeur')}
                onChange={(e) => setVendeurId(e.target.value)}
              >
                <MenuItem value="">
                  <em>{t('vendeurOptional')}</em>
                </MenuItem>
                {vendeurs.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>
            {tCommon('cancel')}
          </Button>
          <Button variant="contained" color="success" onClick={() => void createAchat()} disabled={creating}>
            {creating ? tCommon('loadingEllipsis') : t('openAchat')}
          </Button>
        </DialogActions>
      </FormDialog>
    </div>
  )
}
