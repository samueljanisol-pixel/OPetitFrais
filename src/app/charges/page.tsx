'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import BackNavButton from '@/components/BackNavButton'
import AppLink from '@/components/AppLink'
import FormDialog from '@/lib/mui/FormDialog'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import ChargesEstimationPanel from './ChargesEstimationPanel'

type TabId = 'estimation' | 'feuilles' | 'categories'

type FeuilleListItem = {
  id: string
  ym: string
  total: number
  created_at: string
  updated_at: string
}

type CategoryRow = {
  id: string
  label: string
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

export default function ChargesClient() {
  const { canWriteCharges } = useSessionPermissions()
  const [tab, setTab] = useState<TabId>('estimation')
  const [err, setErr] = useState<string | null>(null)

  const [feuilles, setFeuilles] = useState<FeuilleListItem[]>([])
  const [feuillesLoading, setFeuillesLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createYm, setCreateYm] = useState(() => new Date().toISOString().slice(0, 7))
  const [creating, setCreating] = useState(false)

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [catsLoading, setCatsLoading] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [catEditing, setCatEditing] = useState<CategoryRow | null>(null)
  const [catLabel, setCatLabel] = useState('')
  const [catSort, setCatSort] = useState('0')
  const [catSaving, setCatSaving] = useState(false)
  const [catDelete, setCatDelete] = useState<CategoryRow | null>(null)

  const loadFeuilles = useCallback(async () => {
    setFeuillesLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/charges/feuilles', { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { error?: string; feuilles?: FeuilleListItem[] }
      if (!res.ok) throw new Error(j.error ?? 'Chargement impossible')
      setFeuilles(j.feuilles ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setFeuillesLoading(false)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    setCatsLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/charges/categories', { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { error?: string; categories?: CategoryRow[] }
      if (!res.ok) throw new Error(j.error ?? 'Chargement impossible')
      setCategories(j.categories ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCatsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'feuilles') void loadFeuilles()
    if (tab === 'categories') void loadCategories()
  }, [tab, loadFeuilles, loadCategories])

  const createFeuille = async () => {
    const ym = createYm.trim()
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      setErr('Mois invalide (YYYY-MM)')
      return
    }
    setCreating(true)
    setErr(null)
    try {
      const res = await fetch('/api/charges/feuilles', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Création impossible')
      setCreateOpen(false)
      await loadFeuilles()
      window.location.href = `/charges/feuilles/${ym}`
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  const openNewCat = () => {
    setCatEditing(null)
    setCatLabel('')
    setCatSort(String((categories.length + 1) * 10))
    setCatOpen(true)
  }

  const openEditCat = (c: CategoryRow) => {
    setCatEditing(c)
    setCatLabel(c.label)
    setCatSort(String(c.sort_order))
    setCatOpen(true)
  }

  const saveCat = async () => {
    const label = catLabel.trim()
    if (!label) {
      setErr('Libellé requis')
      return
    }
    setCatSaving(true)
    setErr(null)
    try {
      const payload = { label, sort_order: Number.parseInt(catSort, 10) || 0 }
      const res = catEditing
        ? await fetch(`/api/charges/categories/${catEditing.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/charges/categories', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Enregistrement impossible')
      setCatOpen(false)
      await loadCategories()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCatSaving(false)
    }
  }

  const deleteCat = async () => {
    if (!catDelete) return
    setCatSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/charges/categories/${catDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Suppression impossible')
      setCatDelete(null)
      await loadCategories()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCatSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex flex-col gap-1">
          <BackNavButton href="/" size="small">
            Accueil
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
            Gestion Charges
          </Typography>
          <Typography variant="body2" className="!text-slate-600">
            Estimation récurrente pour le mois en cours, et feuilles de charges réelles par mois.
          </Typography>
        </div>

        {err ? (
          <Paper className="!mb-3 !border-rose-200 !bg-rose-50 !p-3">
            <Typography color="error">{err}</Typography>
          </Paper>
        ) : null}

        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v as TabId)
            setErr(null)
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="estimation" label="Estimation" />
          <Tab value="feuilles" label="Feuilles mensuelles" />
          <Tab value="categories" label="Catégories" />
        </Tabs>

        {tab === 'estimation' ? (
          <Box>
            <Typography variant="body2" className="!mb-3 !text-slate-600">
              Charges récurrentes (jour / mois) utilisées pour estimer le bénéfice net lorsqu’aucune feuille
              réelle n’existe pour le mois.
            </Typography>
            <ChargesEstimationPanel />
          </Box>
        ) : null}

        {tab === 'feuilles' ? (
          <Box className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography variant="body2" className="!text-slate-600">
                Une feuille par mois pour saisir les charges réelles (par catégorie, magasin ou générales).
              </Typography>
              {canWriteCharges ? (
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => setCreateOpen(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Créer un mois
                </Button>
              ) : null}
            </div>
            {feuillesLoading ? (
              <Typography className="!text-slate-600">Chargement…</Typography>
            ) : feuilles.length === 0 ? (
              <Typography className="!text-slate-600">Aucune feuille pour le moment.</Typography>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {feuilles.map((f) => (
                  <Paper
                    key={f.id}
                    component={AppLink}
                    href={`/charges/feuilles/${f.ym}`}
                    className="!p-4 !no-underline transition hover:!border-emerald-300 hover:!shadow-md"
                  >
                    <Typography variant="subtitle1" className="!font-semibold !capitalize !text-slate-900">
                      {monthLabel(f.ym)}
                    </Typography>
                    <Typography variant="caption" className="!font-mono !text-slate-500">
                      {f.ym}
                    </Typography>
                    <Typography variant="body2" className="!mt-2 !text-slate-700">
                      Total : {formatMAD(f.total)} DH
                    </Typography>
                  </Paper>
                ))}
              </div>
            )}
          </Box>
        ) : null}

        {tab === 'categories' ? (
          <Box className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography variant="body2" className="!text-slate-600">
                Catégories utilisées sur les feuilles mensuelles (salaires, loyer…).
              </Typography>
              {canWriteCharges ? (
                <Button variant="contained" color="success" onClick={openNewCat} sx={{ textTransform: 'none' }}>
                  Ajouter
                </Button>
              ) : null}
            </div>
            {catsLoading ? (
              <Typography className="!text-slate-600">Chargement…</Typography>
            ) : (
              <Paper className="!overflow-x-auto !p-2">
                <table className="w-full min-w-[400px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-2 py-1.5 font-medium">Libellé</th>
                      <th className="px-2 py-1.5 text-right font-medium">Tri</th>
                      {canWriteCharges ? (
                        <th className="px-2 py-1.5 text-right font-medium">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="px-2 py-1.5">{c.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{c.sort_order}</td>
                        {canWriteCharges ? (
                          <td className="px-2 py-1.5 text-right">
                            <Button size="small" onClick={() => openEditCat(c)} sx={{ textTransform: 'none' }}>
                              Modifier
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setCatDelete(c)}
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
              </Paper>
            )}
          </Box>
        ) : null}

        <FormDialog
          open={createOpen}
          onClose={() => {
            if (!creating) setCreateOpen(false)
          }}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Créer une feuille mensuelle</DialogTitle>
          <DialogContent>
            <TextField
              className="!mt-2"
              label="Mois"
              type="month"
              value={createYm}
              onChange={(e) => setCreateYm(e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={creating}>
              Annuler
            </Button>
            <Button variant="contained" color="success" onClick={() => void createFeuille()} disabled={creating}>
              {creating ? '…' : 'Créer'}
            </Button>
          </DialogActions>
        </FormDialog>

        <FormDialog
          open={catOpen}
          onClose={() => {
            if (!catSaving) setCatOpen(false)
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>{catEditing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
          <DialogContent>
            <div className="mt-2 flex flex-col gap-2">
              <TextField
                label="Libellé"
                value={catLabel}
                onChange={(e) => setCatLabel(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                label="Ordre"
                value={catSort}
                onChange={(e) => setCatSort(e.target.value)}
                size="small"
                type="number"
                fullWidth
              />
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCatOpen(false)} disabled={catSaving}>
              Annuler
            </Button>
            <Button variant="contained" color="success" onClick={() => void saveCat()} disabled={catSaving}>
              {catSaving ? '…' : 'Enregistrer'}
            </Button>
          </DialogActions>
        </FormDialog>

        <Dialog open={!!catDelete} onClose={() => (!catSaving ? setCatDelete(null) : undefined)}>
          <DialogTitle>Supprimer la catégorie</DialogTitle>
          <DialogContent>
            <Typography>Supprimer « {catDelete?.label} » ?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCatDelete(null)} disabled={catSaving}>
              Annuler
            </Button>
            <Button color="error" variant="contained" onClick={() => void deleteCat()} disabled={catSaving}>
              {catSaving ? '…' : 'Supprimer'}
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </div>
  )
}
