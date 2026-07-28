'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import BackNavButton from '@/components/BackNavButton'
import FormDialog from '@/lib/mui/FormDialog'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { useTranslations } from 'next-intl'
import {
  emballageAchatLigneMontant,
  emballageTypeLabel,
  type EmballageAchatFicheRow,
  type EmballageAchatLigneRow,
  type EmballageRow,
  type EmballageVendeurRow,
} from '@/lib/emballages/types'

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

export default function AchatDetailClient({ achatId }: { achatId: string }) {
  const t = useTranslations('backoffice.emballages')
  const tCommon = useTranslations('common')
  const { canWriteEmballages } = useSessionPermissions()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [achat, setAchat] = useState<EmballageAchatFicheRow | null>(null)
  const [lignes, setLignes] = useState<EmballageAchatLigneRow[]>([])
  const [emballages, setEmballages] = useState<EmballageRow[]>([])
  const [vendeurs, setVendeurs] = useState<EmballageVendeurRow[]>([])
  const [vendeurId, setVendeurId] = useState('')
  const [savingVendeur, setSavingVendeur] = useState(false)

  const [lineOpen, setLineOpen] = useState(false)
  const [editing, setEditing] = useState<EmballageAchatLigneRow | null>(null)
  const [emballageId, setEmballageId] = useState('')
  const [quantite, setQuantite] = useState('')
  const [prixUnitaire, setPrixUnitaire] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteLine, setDeleteLine] = useState<EmballageAchatLigneRow | null>(null)
  const [closeConfirm, setCloseConfirm] = useState(false)

  const isOpen = achat?.statut === 'ouvert'
  const canEdit = canWriteEmballages && isOpen

  const grandTotal = useMemo(
    () => lignes.reduce((acc, l) => acc + emballageAchatLigneMontant(l), 0),
    [lignes],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [achatRes, embRes, vendRes] = await Promise.all([
        fetch(`/api/emballages/achats/${achatId}`, { credentials: 'include' }),
        fetch('/api/emballages', { credentials: 'include' }),
        fetch('/api/emballages/vendeurs', { credentials: 'include' }),
      ])
      const aj = (await achatRes.json().catch(() => ({}))) as {
        error?: string
        achat?: EmballageAchatFicheRow
        lignes?: EmballageAchatLigneRow[]
      }
      const ej = (await embRes.json().catch(() => ({}))) as { error?: string; emballages?: EmballageRow[] }
      const vj = (await vendRes.json().catch(() => ({}))) as { error?: string; vendeurs?: EmballageVendeurRow[] }
      if (!achatRes.ok) throw new Error(aj.error ?? t('errors.loadFailed'))
      if (!embRes.ok) throw new Error(ej.error ?? t('errors.loadFailed'))
      setAchat(aj.achat ?? null)
      setLignes(aj.lignes ?? [])
      setEmballages(ej.emballages ?? [])
      setVendeurs(vj.vendeurs ?? [])
      setVendeurId(aj.achat?.vendeur_id ?? '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setLoading(false)
    }
  }, [achatId, t, tCommon])

  useEffect(() => {
    void load()
  }, [load])

  const openNewLine = () => {
    setEditing(null)
    setEmballageId(emballages[0]?.id ?? '')
    setQuantite('')
    setPrixUnitaire('')
    setNote('')
    setLineOpen(true)
    setErr(null)
  }

  const openEditLine = (row: EmballageAchatLigneRow) => {
    setEditing(row)
    setEmballageId(row.emballage_id)
    setQuantite(String(row.quantite))
    setPrixUnitaire(String(row.prix_unitaire))
    setNote(row.note ?? '')
    setLineOpen(true)
    setErr(null)
  }

  const saveLine = async () => {
    if (!emballageId) {
      setErr(t('errors.emballageRequired'))
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const payload = {
        emballage_id: emballageId,
        quantite,
        prix_unitaire: prixUnitaire,
        note: note.trim() || null,
      }
      const res = editing
        ? await fetch(`/api/emballages/achats/${achatId}/lignes/${editing.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/emballages/achats/${achatId}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? t('errors.saveFailed'))
      setLineOpen(false)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setSaving(false)
    }
  }

  const removeLine = async () => {
    if (!deleteLine) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/emballages/achats/${achatId}/lignes/${deleteLine.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? t('errors.deleteFailed'))
      setDeleteLine(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setSaving(false)
    }
  }

  const saveVendeur = async (nextVendeurId: string) => {
    setSavingVendeur(true)
    setErr(null)
    try {
      const res = await fetch(`/api/emballages/achats/${achatId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendeur_id: nextVendeurId.trim() || null }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; achat?: EmballageAchatFicheRow }
      if (!res.ok) throw new Error(j.error ?? t('errors.saveFailed'))
      if (j.achat) setAchat((prev) => (prev ? { ...prev, ...j.achat } : j.achat ?? null))
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setSavingVendeur(false)
    }
  }

  const cloturer = async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/emballages/achats/${achatId}/cloturer`, {
        method: 'POST',
        credentials: 'include',
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? t('errors.closeFailed'))
      setCloseConfirm(false)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setSaving(false)
    }
  }

  const emballageLabel = (row: EmballageAchatLigneRow): string => emballageTypeLabel(row.ref_emballage)

  if (loading) {
    return <Typography className="!text-slate-600">{tCommon('loading')}</Typography>
  }

  if (!achat) {
    return <Typography color="error">{err ?? t('errors.loadFailed')}</Typography>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <BackNavButton href="/emballages" size="small">
          {t('backAchats')}
        </BackNavButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
          {t('achatDetailTitle', { date: formatDate(achat.date_achat) })}
        </Typography>
        <Typography variant="body2" className="!text-slate-600">
          {achat.statut === 'ouvert' ? t('statut.ouvert') : t('statut.cloture')}
          {achat.note ? ` — ${achat.note}` : ''}
        </Typography>
        {canEdit ? (
          <FormControl size="small" sx={{ mt: 1, minWidth: 220 }}>
            <InputLabel>{t('columns.vendeur')}</InputLabel>
            <Select
              value={vendeurId}
              label={t('columns.vendeur')}
              disabled={savingVendeur}
              onChange={(e) => {
                const next = e.target.value
                setVendeurId(next)
                void saveVendeur(next)
              }}
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
        ) : (
          <Typography variant="body2" className="!text-slate-600">
            {t('columns.vendeur')} : {achat.ref_supplier_vendeur?.label ?? t('vendeurOptional')}
          </Typography>
        )}
      </div>

      {err ? (
        <Paper className="!border-rose-200 !bg-rose-50 !p-3">
          <Typography color="error">{err}</Typography>
        </Paper>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body1" className="!font-semibold !text-slate-800">
          {t('columns.montant')} : {formatMAD(grandTotal)} {tCommon('currency')}
        </Typography>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <>
              <Button
                variant="contained"
                color="success"
                onClick={openNewLine}
                disabled={emballages.length === 0}
                sx={{ textTransform: 'none' }}
              >
                {t('addLine')}
              </Button>
              <Button
                variant="outlined"
                color="success"
                onClick={() => setCloseConfirm(true)}
                disabled={lignes.length === 0}
                sx={{ textTransform: 'none' }}
              >
                {t('closeAchat')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {lignes.length === 0 ? (
        <Typography className="!text-slate-600">{t('achatLinesEmpty')}</Typography>
      ) : (
        <Paper className="!overflow-x-auto !p-2">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-2 py-1.5 font-medium">{t('columns.emballage')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('columns.quantite')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('columns.prixUnitaire')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('columns.montant')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.note')}</th>
                {canEdit ? (
                  <th className="px-2 py-1.5 text-right font-medium">{t('columns.actions')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lignes.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5">{emballageLabel(row)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row.quantite}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatMAD(row.prix_unitaire)} {tCommon('currency')}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatMAD(emballageAchatLigneMontant(row))} {tCommon('currency')}
                  </td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate">{row.note ?? tCommon('emDash')}</td>
                  {canEdit ? (
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <Button size="small" onClick={() => openEditLine(row)} sx={{ textTransform: 'none' }}>
                        {t('edit')}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setDeleteLine(row)}
                        sx={{ textTransform: 'none' }}
                      >
                        {tCommon('delete')}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Paper>
      )}

      <FormDialog
        open={lineOpen}
        onClose={() => {
          if (!saving) setLineOpen(false)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editing ? t('editLine') : t('addLine')}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <FormControl size="small" fullWidth>
              <InputLabel>{t('columns.emballage')}</InputLabel>
              <Select
                value={emballageId}
                label={t('columns.emballage')}
                onChange={(e) => setEmballageId(e.target.value)}
              >
                {emballages.map((e) => (
                  <MenuItem key={e.id} value={e.id}>
                    {emballageTypeLabel(e)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={t('columns.quantite')}
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label={t('columns.prixUnitaire')}
              value={prixUnitaire}
              onChange={(e) => setPrixUnitaire(e.target.value)}
              size="small"
              fullWidth
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
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLineOpen(false)} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button variant="contained" color="success" onClick={() => void saveLine()} disabled={saving}>
            {saving ? tCommon('loadingEllipsis') : tCommon('save')}
          </Button>
        </DialogActions>
      </FormDialog>

      <Dialog open={!!deleteLine} onClose={() => (!saving ? setDeleteLine(null) : undefined)}>
        <DialogTitle>{t('deleteLineTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('deleteLineBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLine(null)} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button color="error" variant="contained" onClick={() => void removeLine()} disabled={saving}>
            {saving ? tCommon('loadingEllipsis') : tCommon('delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={closeConfirm} onClose={() => (!saving ? setCloseConfirm(false) : undefined)}>
        <DialogTitle>{t('closeAchatTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('closeAchatBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseConfirm(false)} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button variant="contained" color="success" onClick={() => void cloturer()} disabled={saving}>
            {saving ? tCommon('loadingEllipsis') : t('closeAchat')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
