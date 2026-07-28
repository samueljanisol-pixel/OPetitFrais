'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import FormDialog from '@/lib/mui/FormDialog'
import { useTranslations } from 'next-intl'
import type { EmballageRow, EmballageTypeRow } from '@/lib/emballages/types'

type Props = {
  canWrite: boolean
  onError: (msg: string | null) => void
}

export default function EmballagesCatalogPanel({ canWrite, onError }: Props) {
  const t = useTranslations('backoffice.emballages')
  const tCommon = useTranslations('common')

  const [rows, setRows] = useState<EmballageRow[]>([])
  const [types, setTypes] = useState<EmballageTypeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EmballageRow | null>(null)
  const [label, setLabel] = useState('')
  const [typeId, setTypeId] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [toDelete, setToDelete] = useState<EmballageRow | null>(null)

  const sortedRows = [...rows].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label, 'fr'),
  )

  const activeTypes = types.filter((t) => t.active)

  const load = useCallback(async () => {
    setLoading(true)
    onError(null)
    try {
      const [embRes, typesRes] = await Promise.all([
        fetch('/api/emballages', { credentials: 'include' }),
        fetch('/api/emballages/types', { credentials: 'include' }),
      ])
      const ej = (await embRes.json().catch(() => ({}))) as { error?: string; emballages?: EmballageRow[] }
      const tj = (await typesRes.json().catch(() => ({}))) as { error?: string; types?: EmballageTypeRow[] }
      if (!embRes.ok) throw new Error(ej.error ?? t('errors.loadFailed'))
      if (!typesRes.ok) throw new Error(tj.error ?? t('errors.loadFailed'))
      setRows(ej.emballages ?? [])
      setTypes(tj.types ?? [])
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setLoading(false)
    }
  }, [onError, t, tCommon])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditing(null)
    setLabel('')
    setTypeId(activeTypes[0]?.id ?? types[0]?.id ?? '')
    setActive(true)
    setOpen(true)
  }

  const openEdit = (row: EmballageRow) => {
    setEditing(row)
    setLabel(row.label)
    setTypeId(row.type_id)
    setActive(row.active)
    setOpen(true)
  }

  const typeLabel = (row: EmballageRow): string =>
    row.ref_emballage_type?.label ?? types.find((x) => x.id === row.type_id)?.label ?? tCommon('emDash')

  const moveEmballage = async (id: string, direction: -1 | 1) => {
    const sorted = [...rows].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label, 'fr'),
    )
    const idx = sorted.findIndex((r) => r.id === id)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return

    const next = [...sorted]
    const tmp = next[idx]!
    next[idx] = next[swapIdx]!
    next[swapIdx] = tmp

    const updates = next.map((r, i) => ({ id: r.id, sort_order: i + 1 }))
    setReordering(true)
    onError(null)
    try {
      const results = await Promise.all(
        updates.map((u) =>
          fetch(`/api/emballages/${u.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: u.sort_order }),
          }),
        ),
      )
      for (const res of results) {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j.error ?? t('errors.saveFailed'))
        }
      }
      setRows(next.map((r, i) => ({ ...r, sort_order: i + 1 })))
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setReordering(false)
    }
  }

  const save = async () => {
    const trimmed = label.trim()
    if (!trimmed) {
      onError(t('errors.labelRequired'))
      return
    }
    if (!typeId) {
      onError(t('errors.typeRequired'))
      return
    }
    setSaving(true)
    onError(null)
    try {
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0)
      const payload = {
        label: trimmed,
        type_id: typeId,
        active,
        ...(editing ? {} : { sort_order: maxOrder + 1 }),
      }
      const res = editing
        ? await fetch(`/api/emballages/${editing.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/emballages', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? t('errors.saveFailed'))
      setOpen(false)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!toDelete) return
    setSaving(true)
    onError(null)
    try {
      const res = await fetch(`/api/emballages/${toDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? t('errors.deleteFailed'))
      setToDelete(null)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2" className="!text-slate-600">
          {t('catalogHint')}
        </Typography>
        {canWrite ? (
          <Button
            variant="contained"
            color="success"
            onClick={openNew}
            disabled={types.length === 0}
            sx={{ textTransform: 'none' }}
          >
            {tCommon('add')}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Typography className="!text-slate-600">{tCommon('loading')}</Typography>
      ) : rows.length === 0 ? (
        <Typography className="!text-slate-600">{t('catalogEmpty')}</Typography>
      ) : (
        <Paper className="!overflow-x-auto !p-2">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-2 py-1.5 font-medium">{t('columns.label')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.type')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.sortOrder')}</th>
                <th className="px-2 py-1.5 font-medium">{t('columns.active')}</th>
                {canWrite ? (
                  <th className="px-2 py-1.5 text-right font-medium">{t('columns.actions')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const idx = sortedRows.findIndex((r) => r.id === row.id)
                return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5">{row.label}</td>
                  <td className="px-2 py-1.5">{typeLabel(row)}</td>
                  <td className="px-2 py-1.5">
                    {canWrite ? (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                        <IconButton
                          size="small"
                          aria-label={t('moveUp')}
                          disabled={reordering || idx <= 0}
                          onClick={() => void moveEmballage(row.id, -1)}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={t('moveDown')}
                          disabled={reordering || idx < 0 || idx >= sortedRows.length - 1}
                          onClick={() => void moveEmballage(row.id, 1)}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      tCommon('emDash')
                    )}
                  </td>
                  <td className="px-2 py-1.5">{row.active ? t('activeYes') : t('activeNo')}</td>
                  {canWrite ? (
                    <td className="px-2 py-1.5 text-right">
                      <Button size="small" onClick={() => openEdit(row)} sx={{ textTransform: 'none' }}>
                        {t('edit')}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setToDelete(row)}
                        sx={{ textTransform: 'none' }}
                      >
                        {tCommon('delete')}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              )})}
            </tbody>
          </table>
        </Paper>
      )}

      <FormDialog
        open={open}
        onClose={() => {
          if (!saving) setOpen(false)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editing ? t('editEmballage') : t('newEmballage')}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <TextField
              label={t('columns.label')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              size="small"
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>{t('columns.type')}</InputLabel>
              <Select
                value={typeId}
                label={t('columns.type')}
                onChange={(e) => setTypeId(e.target.value)}
              >
                {types.map((typeRow) => (
                  <MenuItem key={typeRow.id} value={typeRow.id}>
                    {typeRow.label}
                    {!typeRow.active ? ` (${t('activeNo')})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />}
              label={t('columns.active')}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button variant="contained" color="success" onClick={() => void save()} disabled={saving}>
            {saving ? tCommon('loadingEllipsis') : tCommon('save')}
          </Button>
        </DialogActions>
      </FormDialog>

      <Dialog open={!!toDelete} onClose={() => (!saving ? setToDelete(null) : undefined)}>
        <DialogTitle>{t('deleteEmballageTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('deleteEmballageBody', { label: toDelete?.label ?? '' })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button color="error" variant="contained" onClick={() => void remove()} disabled={saving}>
            {saving ? tCommon('loadingEllipsis') : tCommon('delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
