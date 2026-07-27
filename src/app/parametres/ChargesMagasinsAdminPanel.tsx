'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
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
import FormDialog from '@/lib/mui/FormDialog'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import { lineAmount, type MagasinChargePeriodicite } from '@/lib/ca/magasinCharges'

type MagasinLite = {
  id: string
  code: string
  nom: string
  sort_order: number
}

type ChargeRow = {
  id: string
  magasin_id: string | null
  label: string
  quantite: number
  prix: number
  periodicite: MagasinChargePeriodicite
  sort_order: number
}

type FormState = {
  magasin_id: string | null
  label: string
  quantite: string
  prix: string
  periodicite: MagasinChargePeriodicite
}

const emptyForm = (magasin_id: string | null = null): FormState => ({
  magasin_id,
  label: '',
  quantite: '1',
  prix: '0',
  periodicite: 'mois',
})

function formatMAD(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export default function ChargesMagasinsAdminPanel() {
  const { canWriteParametres } = useSessionPermissions()
  const [magasins, setMagasins] = useState<MagasinLite[]>([])
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ChargeRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ChargeRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const res = await fetch('/api/ref/magasin-charges', { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        charges?: ChargeRow[]
        magasins?: MagasinLite[]
      }
      if (!res.ok) throw new Error(j.error ?? 'Chargement impossible')
      setCharges(j.charges ?? [])
      setMagasins(j.magasins ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sections = useMemo(() => {
    const byMag = new Map<string | null, ChargeRow[]>()
    byMag.set(null, [])
    for (const m of magasins) byMag.set(m.id, [])
    for (const c of charges) {
      const key = c.magasin_id
      if (!byMag.has(key)) byMag.set(key, [])
      byMag.get(key)!.push(c)
    }
    const magSections = magasins.map((m) => ({
      key: m.id as string | null,
      title: `${m.nom} (${m.code})`,
      rows: byMag.get(m.id) ?? [],
    }))
    return [
      ...magSections,
      { key: null as string | null, title: 'Général', rows: byMag.get(null) ?? [] },
    ]
  }, [magasins, charges])

  const grandTotal = useMemo(
    () => charges.reduce((acc, c) => acc + lineAmount(c), 0),
    [charges],
  )

  const openNew = (magasin_id: string | null) => {
    setEditing(null)
    setForm(emptyForm(magasin_id))
    setOpen(true)
    setErr(null)
  }

  const openEdit = (row: ChargeRow) => {
    setEditing(row)
    setForm({
      magasin_id: row.magasin_id,
      label: row.label,
      quantite: String(row.quantite),
      prix: String(row.prix),
      periodicite: row.periodicite,
    })
    setOpen(true)
    setErr(null)
  }

  const save = async () => {
    const label = form.label.trim()
    if (!label) {
      setErr('Libellé requis')
      return
    }
    const quantite = Number(form.quantite.replace(',', '.'))
    const prix = Number(form.prix.replace(',', '.'))
    if (!Number.isFinite(quantite) || quantite <= 0) {
      setErr('Quantité invalide (> 0)')
      return
    }
    if (!Number.isFinite(prix) || prix < 0) {
      setErr('Prix invalide (≥ 0)')
      return
    }

    setSaving(true)
    setErr(null)
    try {
      const payload = {
        magasin_id: form.magasin_id,
        label,
        quantite,
        prix,
        periodicite: form.periodicite,
      }
      const res = editing
        ? await fetch(`/api/ref/magasin-charges/${editing.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/ref/magasin-charges', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Enregistrement impossible')
      setOpen(false)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setErr(null)
    try {
      const res = await fetch(`/api/ref/magasin-charges/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Suppression impossible')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <Typography className="!text-slate-600">Chargement des charges…</Typography>
  }

  return (
    <Box className="flex flex-col gap-4">
      {err ? (
        <Paper className="!border-rose-200 !bg-rose-50 !p-3">
          <Typography color="error">{err}</Typography>
        </Paper>
      ) : null}

      <Typography variant="body2" className="!text-slate-600">
        Définissez les charges par magasin et les charges générales. Total ligne = quantité × prix. Les
        charges générales s’appliquent uniquement aux totaux globaux des stats (bénéfice net).
      </Typography>

      <Typography variant="subtitle2" className="!text-slate-800">
        Total toutes charges (forfait ligne) : {formatMAD(grandTotal)} DH
      </Typography>

      {sections.map((section) => {
        const sectionTotal = section.rows.reduce((acc, r) => acc + lineAmount(r), 0)
        return (
          <Paper key={section.key ?? '__general__'} className="!p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Typography variant="subtitle1" className="!font-semibold">
                  {section.title}
                </Typography>
                <Typography variant="caption" className="!text-slate-500">
                  Total section : {formatMAD(sectionTotal)} DH
                </Typography>
              </div>
              {canWriteParametres ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  onClick={() => openNew(section.key)}
                  sx={{ textTransform: 'none' }}
                >
                  Ajouter
                </Button>
              ) : null}
            </div>

            {section.rows.length === 0 ? (
              <Typography variant="body2" className="!text-slate-500">
                Aucune charge.
              </Typography>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-2 py-1.5 font-medium">Libellé</th>
                      <th className="px-2 py-1.5 text-right font-medium">Qté</th>
                      <th className="px-2 py-1.5 text-right font-medium">Prix</th>
                      <th className="px-2 py-1.5 font-medium">Périodicité</th>
                      <th className="px-2 py-1.5 text-right font-medium">Total</th>
                      {canWriteParametres ? (
                        <th className="px-2 py-1.5 text-right font-medium">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 text-slate-900">{r.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.quantite}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMAD(r.prix)}</td>
                        <td className="px-2 py-1.5 capitalize text-slate-700">{r.periodicite}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {formatMAD(lineAmount(r))}
                        </td>
                        {canWriteParametres ? (
                          <td className="px-2 py-1.5 text-right">
                            <Button size="small" onClick={() => openEdit(r)} sx={{ textTransform: 'none' }}>
                              Modifier
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(r)}
                              sx={{ textTransform: 'none' }}
                            >
                              Suppr.
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paper>
        )
      })}

      <FormDialog
        open={open}
        onClose={() => {
          if (!saving) setOpen(false)
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editing ? 'Modifier la charge' : 'Nouvelle charge'}</DialogTitle>
        <DialogContent>
          <div className="mt-2 flex flex-col gap-2">
            <FormControl size="small" fullWidth>
              <InputLabel id="charge-magasin-label">Magasin</InputLabel>
              <Select
                labelId="charge-magasin-label"
                label="Magasin"
                value={form.magasin_id ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setForm((prev) => ({ ...prev, magasin_id: v === '' ? null : String(v) }))
                }}
              >
                <MenuItem value="">Général</MenuItem>
                {magasins.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.nom} ({m.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Libellé"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              size="small"
              fullWidth
            />
            <TextField
              label="Quantité"
              value={form.quantite}
              onChange={(e) => setForm((prev) => ({ ...prev, quantite: e.target.value }))}
              size="small"
              fullWidth
              slotProps={muiSlotPropsDecimalKeypad}
            />
            <TextField
              label="Prix"
              value={form.prix}
              onChange={(e) => setForm((prev) => ({ ...prev, prix: e.target.value }))}
              size="small"
              fullWidth
              slotProps={muiSlotPropsDecimalKeypad}
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="charge-period-label">Périodicité</InputLabel>
              <Select
                labelId="charge-period-label"
                label="Périodicité"
                value={form.periodicite}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    periodicite: e.target.value === 'jour' ? 'jour' : 'mois',
                  }))
                }
              >
                <MenuItem value="jour">Par jour</MenuItem>
                <MenuItem value="mois">Par mois</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" className="!text-slate-600">
              Total ligne :{' '}
              {formatMAD(
                lineAmount({
                  quantite: Number(form.quantite.replace(',', '.')) || 0,
                  prix: Number(form.prix.replace(',', '.')) || 0,
                }),
              )}{' '}
              DH
            </Typography>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            Annuler
          </Button>
          <Button variant="contained" color="success" onClick={() => void save()} disabled={saving}>
            {saving ? '…' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </FormDialog>

      <Dialog open={!!deleteTarget} onClose={() => (!deleting ? setDeleteTarget(null) : undefined)}>
        <DialogTitle>Supprimer la charge</DialogTitle>
        <DialogContent>
          <Typography>
            Supprimer « {deleteTarget?.label} » ? Cette action est irréversible.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Annuler
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? '…' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
