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
import BackNavButton from '@/components/BackNavButton'
import FormDialog from '@/lib/mui/FormDialog'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import { lineAmount } from '@/lib/ca/magasinCharges'

type MagasinLite = { id: string; code: string; nom: string; sort_order: number }
type CategoryRow = { id: string; label: string; sort_order: number }
type LigneRow = {
  id: string
  categorie_id: string
  magasin_id: string | null
  label: string
  quantite: number
  prix: number
  sort_order: number
}

function formatMAD(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym
  const [yy, mm] = ym.split('-').map((x) => Number(x))
  const d = new Date(Date.UTC(yy, mm - 1, 1))
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

export default function FeuilleDetailClient({ ym }: { ym: string }) {
  const { canWriteCharges } = useSessionPermissions()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [magasins, setMagasins] = useState<MagasinLite[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [lignes, setLignes] = useState<LigneRow[]>([])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LigneRow | null>(null)
  const [formCat, setFormCat] = useState('')
  const [formMag, setFormMag] = useState<string>('')
  const [formLabel, setFormLabel] = useState('')
  const [formQty, setFormQty] = useState('1')
  const [formPrix, setFormPrix] = useState('0')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LigneRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/charges/feuilles/${encodeURIComponent(ym)}`, {
        credentials: 'include',
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        lignes?: LigneRow[]
        categories?: CategoryRow[]
        magasins?: MagasinLite[]
      }
      if (!res.ok) throw new Error(j.error ?? 'Chargement impossible')
      setLignes(j.lignes ?? [])
      setCategories(j.categories ?? [])
      setMagasins(j.magasins ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [ym])

  useEffect(() => {
    void load()
  }, [load])

  const grandTotal = useMemo(() => lignes.reduce((a, l) => a + lineAmount(l), 0), [lignes])

  const byCategory = useMemo(() => {
    return categories.map((cat) => {
      const rows = lignes.filter((l) => l.categorie_id === cat.id)
      const total = rows.reduce((a, l) => a + lineAmount(l), 0)
      const byMag = new Map<string | null, LigneRow[]>()
      byMag.set(null, [])
      for (const m of magasins) byMag.set(m.id, [])
      for (const r of rows) {
        const key = r.magasin_id
        if (!byMag.has(key)) byMag.set(key, [])
        byMag.get(key)!.push(r)
      }
      const sections = [
        ...magasins.map((m) => ({
          key: m.id as string | null,
          title: `${m.nom} (${m.code})`,
          rows: byMag.get(m.id) ?? [],
        })),
        { key: null as string | null, title: 'Général', rows: byMag.get(null) ?? [] },
      ]
      return { cat, total, sections }
    })
  }, [categories, lignes, magasins])

  const openNew = (categorieId: string, magasinId: string | null) => {
    setEditing(null)
    setFormCat(categorieId || categories[0]?.id || '')
    setFormMag(magasinId ?? '')
    setFormLabel('')
    setFormQty('1')
    setFormPrix('0')
    setOpen(true)
    setErr(null)
  }

  const openEdit = (row: LigneRow) => {
    setEditing(row)
    setFormCat(row.categorie_id)
    setFormMag(row.magasin_id ?? '')
    setFormLabel(row.label)
    setFormQty(String(row.quantite))
    setFormPrix(String(row.prix))
    setOpen(true)
    setErr(null)
  }

  const save = async () => {
    const label = formLabel.trim()
    if (!label || !formCat) {
      setErr('Libellé et catégorie requis')
      return
    }
    const quantite = Number(formQty.replace(',', '.'))
    const prix = Number(formPrix.replace(',', '.'))
    if (!Number.isFinite(quantite) || quantite <= 0) {
      setErr('Quantité invalide')
      return
    }
    if (!Number.isFinite(prix) || prix < 0) {
      setErr('Prix invalide')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const payload = {
        categorie_id: formCat,
        magasin_id: formMag === '' ? null : formMag,
        label,
        quantite,
        prix,
      }
      const res = editing
        ? await fetch(`/api/charges/feuilles/${encodeURIComponent(ym)}/lignes/${editing.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/charges/feuilles/${encodeURIComponent(ym)}`, {
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
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(
        `/api/charges/feuilles/${encodeURIComponent(ym)}/lignes/${deleteTarget.id}`,
        { method: 'DELETE', credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Suppression impossible')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <Typography className="!text-slate-600">Chargement…</Typography>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex flex-col gap-1">
          <BackNavButton href="/charges" size="small">
            Gestion Charges
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }} className="!capitalize">
            {monthLabel(ym)}
          </Typography>
          <Typography variant="body2" className="!font-mono !text-slate-500">
            {ym} — charges réelles
          </Typography>
          <Typography variant="subtitle1" className="!font-semibold !text-slate-800">
            Total feuille : {formatMAD(grandTotal)} DH
          </Typography>
        </div>

        {err ? (
          <Paper className="!mb-3 !border-rose-200 !bg-rose-50 !p-3">
            <Typography color="error">{err}</Typography>
          </Paper>
        ) : null}

        {byCategory.map(({ cat, total, sections }) => (
          <Paper key={cat.id} className="!mb-4 !p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Typography variant="h6" className="!font-semibold">
                  {cat.label}
                </Typography>
                <Typography variant="caption" className="!text-slate-500">
                  Total catégorie : {formatMAD(total)} DH
                </Typography>
              </div>
            </div>
            {sections.map((section) => {
              const sectionTotal = section.rows.reduce((a, r) => a + lineAmount(r), 0)
              return (
                <Box key={`${cat.id}-${section.key ?? 'g'}`} className="mb-4 rounded-lg border border-slate-100 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Typography variant="subtitle2" className="!font-semibold">
                      {section.title}{' '}
                      <span className="font-normal text-slate-500">({formatMAD(sectionTotal)} DH)</span>
                    </Typography>
                    {canWriteCharges ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        onClick={() => openNew(cat.id, section.key)}
                        sx={{ textTransform: 'none' }}
                      >
                        Ajouter
                      </Button>
                    ) : null}
                  </div>
                  {section.rows.length === 0 ? (
                    <Typography variant="body2" className="!text-slate-500">
                      Aucune ligne.
                    </Typography>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-600">
                            <th className="px-2 py-1 font-medium">Libellé</th>
                            <th className="px-2 py-1 text-right font-medium">Qté</th>
                            <th className="px-2 py-1 text-right font-medium">Prix</th>
                            <th className="px-2 py-1 text-right font-medium">Total</th>
                            {canWriteCharges ? (
                              <th className="px-2 py-1 text-right font-medium">Actions</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100">
                              <td className="px-2 py-1">{r.label}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{r.quantite}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{formatMAD(r.prix)}</td>
                              <td className="px-2 py-1 text-right font-medium tabular-nums">
                                {formatMAD(lineAmount(r))}
                              </td>
                              {canWriteCharges ? (
                                <td className="px-2 py-1 text-right">
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
                </Box>
              )
            })}
          </Paper>
        ))}

        <FormDialog
          open={open}
          onClose={() => {
            if (!saving) setOpen(false)
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>{editing ? 'Modifier la ligne' : 'Nouvelle ligne'}</DialogTitle>
          <DialogContent>
            <div className="mt-2 flex flex-col gap-2">
              <FormControl size="small" fullWidth>
                <InputLabel id="ligne-cat">Catégorie</InputLabel>
                <Select
                  labelId="ligne-cat"
                  label="Catégorie"
                  value={formCat}
                  onChange={(e) => setFormCat(String(e.target.value))}
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="ligne-mag">Magasin</InputLabel>
                <Select
                  labelId="ligne-mag"
                  label="Magasin"
                  value={formMag}
                  onChange={(e) => setFormMag(String(e.target.value))}
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
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                label="Quantité"
                value={formQty}
                onChange={(e) => setFormQty(e.target.value)}
                size="small"
                fullWidth
                slotProps={muiSlotPropsDecimalKeypad}
              />
              <TextField
                label="Prix"
                value={formPrix}
                onChange={(e) => setFormPrix(e.target.value)}
                size="small"
                fullWidth
                slotProps={muiSlotPropsDecimalKeypad}
              />
              <Typography variant="body2" className="!text-slate-600">
                Total ligne :{' '}
                {formatMAD(
                  lineAmount({
                    quantite: Number(formQty.replace(',', '.')) || 0,
                    prix: Number(formPrix.replace(',', '.')) || 0,
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

        <Dialog open={!!deleteTarget} onClose={() => (!saving ? setDeleteTarget(null) : undefined)}>
          <DialogTitle>Supprimer la ligne</DialogTitle>
          <DialogContent>
            <Typography>Supprimer « {deleteTarget?.label} » ?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteTarget(null)} disabled={saving}>
              Annuler
            </Button>
            <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={saving}>
              {saving ? '…' : 'Supprimer'}
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </div>
  )
}
