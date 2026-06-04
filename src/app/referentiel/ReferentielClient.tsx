'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
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
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import BackNavButton from '@/components/BackNavButton'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { RefConditionnementRow, RefRow, RefVendeurRow } from '@/lib/products/types'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import MagasinsAdminPanel from './MagasinsAdminPanel'
import StatusLabelsAdminPanel from './StatusLabelsAdminPanel'
import StockAdminPanel from './StockAdminPanel'
import TranslationsAdminPanel from './TranslationsAdminPanel'

type TabId = 'udv' | 'cat' | 'sup' | 'cond' | 'vend' | 'stock' | 'traductions' | 'comptes'

const tabLabels: Record<TabId, string> = {
  udv: 'Unités de vente',
  cat: 'Catégories',
  sup: 'Fournisseurs',
  cond: 'Conditionnements',
  vend: 'Vendeurs',
  stock: 'Stock',
  traductions: 'Traductions',
  comptes: 'Administration',
}

const deleteConfirmPhrase: Partial<Record<TabId, string>> = {
  udv: 'cette unité de vente',
  cat: 'cette catégorie',
  sup: 'ce fournisseur',
  cond: 'ce conditionnement',
  vend: 'ce vendeur',
}

type DeleteConfirmTarget = { tab: TabId; id: string; label: string }

function RefTable<T extends { id: string; label: string }>({
  title,
  rows,
  onEdit,
  onDelete,
  extras,
}: {
  title: string
  rows: T[]
  onEdit: (r: T) => void
  onDelete: (row: T) => void
  extras?: Array<{ header: string; render: (r: T) => ReactNode }>
}) {
  return (
    <div>
      <Typography variant="subtitle1" className="text-slate-900" sx={{ mb: 1, fontWeight: 600 }}>
        {title}
      </Typography>
      <div className="overflow-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm text-slate-900">
          <thead>
            <tr className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-800">
              <th className="p-2">Libellé</th>
              {extras?.map((col, i) => (
                <th key={`${col.header}-${i}`} className="p-2">
                  {col.header}
                </th>
              ))}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2 text-slate-900">{r.label}</td>
                {extras?.map((col, i) => (
                  <td key={`${col.header}-${i}`} className="p-2 text-sm text-slate-800">
                    {col.render(r)}
                  </td>
                ))}
                <td className="p-2 text-right">
                  <Button size="small" onClick={() => onEdit(r)} sx={{ textTransform: 'none' }}>
                    Modifier
                  </Button>
                  <Button size="small" color="error" onClick={() => onDelete(r)} sx={{ textTransform: 'none' }}>
                    Suppr.
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReferentielClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const { isAdministrator, canAdminUsers, canAdminRoles, canAdminMagasins } = useSessionPermissions()
  const showComptesTab = isAdministrator
  const tabOrder = useMemo(() => {
    const base: TabId[] = ['udv', 'cat', 'sup', 'cond', 'vend', 'stock', 'traductions']
    if (showComptesTab) base.push('comptes')
    return base
  }, [showComptesTab])
  const [tab, setTab] = useState<TabId>('udv')
  const [udv, setUdv] = useState<RefRow[]>([])
  const [cat, setCat] = useState<RefRow[]>([])
  const [sup, setSup] = useState<RefRow[]>([])
  const [cond, setCond] = useState<RefConditionnementRow[]>([])
  const [vendeurs, setVendeurs] = useState<RefVendeurRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RefRow | RefConditionnementRow | RefVendeurRow | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmTarget | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [form, setForm] = useState({
    label: '',
    label_ar: '',
    h: '',
    w: '',
    d: '',
    supplier_id: '',
  })

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    const [a, b, c, d, e] = await Promise.all([
      supabase.from('ref_sales_unit').select('*').order('sort_order'),
      supabase.from('ref_category').select('*').order('sort_order'),
      supabase.from('ref_supplier').select('*').order('sort_order'),
      supabase.from('ref_conditionnement').select('*, ref_supplier(id, code, label)').order('sort_order'),
      supabase
        .from('ref_supplier_vendeur')
        .select('*, ref_supplier(id, code, label)')
        .order('sort_order')
        .order('label'),
    ])
    const firstErr = a.error ?? b.error ?? c.error ?? d.error ?? e.error
    if (firstErr) setErr(firstErr.message)
    setUdv((a.data as RefRow[]) ?? [])
    setCat((b.data as RefRow[]) ?? [])
    setSup((c.data as RefRow[]) ?? [])
    setCond((d.data as RefConditionnementRow[]) ?? [])
    setVendeurs((e.data as RefVendeurRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showComptesTab && tab === 'comptes') setTab('udv')
  }, [showComptesTab, tab])

  const openNew = () => {
    setIsNew(true)
    if (tab === 'vend') {
      setEditing({ id: '', supplier_id: sup[0]?.id ?? '', label: '', sort_order: 0 } as RefVendeurRow)
      setForm({ label: '', label_ar: '', h: '', w: '', d: '', supplier_id: sup[0]?.id ?? '' })
    } else {
      setEditing({ id: '', code: '', label: '', sort_order: 0, created_at: '' } as RefRow)
      setForm({ label: '', label_ar: '', h: '', w: '', d: '', supplier_id: '' })
    }
    setOpen(true)
  }

  const openRow = (r: RefRow | RefConditionnementRow | RefVendeurRow) => {
    setIsNew(false)
    setEditing(r)
    setForm({
      label: r.label,
      label_ar: 'label_ar' in r && typeof r.label_ar === 'string' ? r.label_ar : '',
      h: 'height_mm' in r && r.height_mm != null ? String(r.height_mm) : '',
      w: 'width_mm' in r && r.width_mm != null ? String(r.width_mm) : '',
      d: 'depth_mm' in r && r.depth_mm != null ? String(r.depth_mm) : '',
      supplier_id:
        'supplier_id' in r && typeof r.supplier_id === 'string' && r.supplier_id.length > 0
          ? r.supplier_id
          : '',
    })
    setOpen(true)
  }

  const tableName = (t: TabId) => {
    if (t === 'udv') return 'ref_sales_unit'
    if (t === 'cat') return 'ref_category'
    if (t === 'sup') return 'ref_supplier'
    if (t === 'vend') return 'ref_supplier_vendeur'
    if (t === 'cond') return 'ref_conditionnement'
    return 'ref_sales_unit'
  }

  const save = async () => {
    if (!editing || tab === 'comptes' || tab === 'stock' || tab === 'traductions') return
    setErr(null)
    if (tab === 'cond') {
      const h = form.h ? Number(form.h) : null
      const w = form.w ? Number(form.w) : null
      const d = form.d ? Number(form.d) : null
      const supplierId = form.supplier_id.trim() || null
      const labelArTrim = form.label_ar.trim()
      if (isNew) {
        const { error: e0 } = await supabase.from('ref_conditionnement').insert({
          label: form.label.trim(),
          label_ar: labelArTrim.length > 0 ? labelArTrim : null,
          height_mm: h,
          width_mm: w,
          depth_mm: d,
          supplier_id: supplierId,
        } as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from('ref_conditionnement')
          .update({
            label: form.label.trim(),
            label_ar: labelArTrim.length > 0 ? labelArTrim : null,
            height_mm: h,
            width_mm: w,
            depth_mm: d,
            supplier_id: supplierId,
          } as never)
          .eq('id', editing.id)
        if (e0) {
          setErr(e0.message)
          return
        }
      }
    } else if (tab === 'vend') {
      const supplierId = form.supplier_id.trim()
      if (!supplierId) {
        setErr('Fournisseur requis pour un vendeur.')
        return
      }
      if (isNew) {
        const { error: e0 } = await supabase.from('ref_supplier_vendeur').insert({
          supplier_id: supplierId,
          label: form.label.trim(),
        } as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from('ref_supplier_vendeur')
          .update({
            supplier_id: supplierId,
            label: form.label.trim(),
          } as never)
          .eq('id', editing.id)
        if (e0) {
          setErr(e0.message)
          return
        }
      }
    } else {
      if (isNew) {
        const { error: e0 } = await supabase.from(tableName(tab)).insert({
          label: form.label.trim(),
        } as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from(tableName(tab))
          .update({
            label: form.label.trim(),
          } as never)
          .eq('id', editing.id)
        if (e0) {
          setErr(e0.message)
          return
        }
      }
    }
    setOpen(false)
    void load()
  }

  const requestDelete = (row: { id: string; label: string }) => {
    if (tab === 'comptes' || tab === 'stock' || tab === 'traductions') return
    setDeleteConfirm({ tab, id: row.id, label: row.label })
  }

  const executeDelete = async () => {
    if (!deleteConfirm) return
    const target = deleteConfirm
    setDeleteBusy(true)
    setErr(null)
    const t = tableName(target.tab)
    const { error: e0 } = await supabase.from(t).delete().eq('id', target.id)
    setDeleteBusy(false)
    if (e0) {
      setErr(e0.message)
      return
    }
    setDeleteConfirm(null)
    void load()
  }

  if (loading)
    return (
      <div className="p-6">
        <p className="text-slate-600">Chargement…</p>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex flex-col gap-1">
          <BackNavButton href="/" size="small">
            Accueil
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
            Paramètres
          </Typography>
        </div>
        {err ? <div className="mb-2 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{err}</div> : null}
        <Tabs
          value={tabOrder.includes(tab) ? tab : 'udv'}
          onChange={(_, v) => {
            setTab(v as TabId)
            setErr(null)
          }}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', maxWidth: '100%' }}
        >
          {tabOrder.map(k => (
            <Tab key={k} value={k} label={tabLabels[k]} />
          ))}
        </Tabs>
        {tab !== 'comptes' && tab !== 'stock' && tab !== 'traductions' ? (
          <Button variant="contained" color="success" onClick={openNew} sx={{ mb: 2, textTransform: 'none' }}>
            Ajouter — {tabLabels[tab]}
          </Button>
        ) : null}
        {tab === 'traductions' ? <TranslationsAdminPanel /> : null}
        {tab === 'comptes' ? (
          <>
            <Box className="mb-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
              <Typography variant="body2" className="!mb-3 !text-slate-600">
                Gestion des comptes utilisateurs et des rôles d&apos;accès à l&apos;application.
              </Typography>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {canAdminUsers ? (
                  <Button href="/admin/utilisateurs" variant="outlined" color="success" sx={{ textTransform: 'none' }}>
                    Utilisateurs
                  </Button>
                ) : null}
                {canAdminRoles ? (
                  <Button href="/admin/roles" variant="outlined" color="success" sx={{ textTransform: 'none' }}>
                    Rôles & accès
                  </Button>
                ) : null}
              </div>
            </Box>
            {canAdminMagasins ? (
              <Box className="mb-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
                <Typography variant="subtitle1" className="!mb-2 !font-semibold !text-slate-900">
                  Magasins & caisses
                </Typography>
                <MagasinsAdminPanel />
              </Box>
            ) : null}
            {isAdministrator ? <StatusLabelsAdminPanel /> : null}
          </>
        ) : null}
        {tab === 'udv' && <RefTable title="Unités" rows={udv} onEdit={openRow} onDelete={requestDelete} />}
        {tab === 'cat' && <RefTable title="Catégories" rows={cat} onEdit={openRow} onDelete={requestDelete} />}
        {tab === 'sup' && <RefTable title="Fournisseurs" rows={sup} onEdit={openRow} onDelete={requestDelete} />}
        {tab === 'vend' && (
          <RefTable
            title="Vendeurs (par fournisseur)"
            rows={vendeurs}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Fournisseur',
                render: r => {
                  const row = r as RefVendeurRow
                  const s = row.ref_supplier
                  if (s && typeof s === 'object' && 'label' in s && !Array.isArray(s)) {
                    return (s as RefRow).label
                  }
                  if (Array.isArray(s) && s[0] && 'label' in s[0]) return s[0].label
                  const supRow = sup.find(x => x.id === row.supplier_id)
                  return supRow?.label ?? '—'
                },
              },
            ]}
          />
        )}
        {tab === 'stock' && <StockAdminPanel />}
        {tab === 'cond' && (
          <RefTable
            title="Conditionnements (dimensions en mm)"
            rows={cond}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Libellé arabe',
                render: r => {
                  const ar = (r as RefConditionnementRow).label_ar?.trim()
                  return ar && ar.length > 0 ? (
                    <span dir="rtl" className="block text-right">
                      {ar}
                    </span>
                  ) : (
                    '—'
                  )
                },
              },
              {
                header: 'Dimensions (mm)',
                render: r =>
                  `${(r as RefConditionnementRow).height_mm ?? '—'} × ${(r as RefConditionnementRow).width_mm ?? '—'} × ${(r as RefConditionnementRow).depth_mm ?? '—'}`,
              },
              {
                header: 'Fournisseur',
                render: r => {
                  const row = r as RefConditionnementRow
                  const s = row.ref_supplier
                  if (s && typeof s === 'object' && 'label' in s) return (s as RefRow).label
                  return '—'
                },
              },
            ]}
          />
        )}

        <Dialog open={deleteConfirm != null} onClose={() => !deleteBusy && setDeleteConfirm(null)} fullWidth maxWidth="xs">
          <DialogTitle>Confirmer la suppression</DialogTitle>
          <DialogContent>
            {deleteConfirm ? (
              <Typography variant="body2" color="text.secondary" className="!mt-1">
                Supprimer {deleteConfirmPhrase[deleteConfirm.tab] ?? 'cette entrée'}{' '}
                <strong className="text-slate-900">
                  « {deleteConfirm.label.trim() || 'sans libellé'} »
                </strong>{' '}
                ?
                <br />
                <br />
                Cette action est définitive et peut échouer si l’entrée est encore utilisée ailleurs.
              </Typography>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteBusy} sx={{ textTransform: 'none' }}>
              Annuler
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={deleteBusy}
              onClick={() => void executeDelete()}
              sx={{ textTransform: 'none' }}
            >
              {deleteBusy ? '…' : 'Supprimer'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{isNew ? 'Ajouter' : 'Modifier'}</DialogTitle>
          <DialogContent>
            <div className="mt-1 flex flex-col gap-4">
              <TextField label="Libellé" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} size="small" fullWidth />
              {tab === 'cond' ? (
                <TextField
                  label="Libellé Arabe"
                  value={form.label_ar}
                  onChange={e => setForm(f => ({ ...f, label_ar: e.target.value }))}
                  size="small"
                  fullWidth
                  slotProps={{ input: { dir: 'rtl' } }}
                />
              ) : null}
              {tab === 'vend' || tab === 'cond' ? (
                <>
                  <FormControl size="small" fullWidth required={tab === 'vend'}>
                    <InputLabel id="ref-supplier-label">Fournisseur{tab === 'cond' ? ' (optionnel)' : ''}</InputLabel>
                    <Select
                      labelId="ref-supplier-label"
                      label={tab === 'vend' ? 'Fournisseur' : 'Fournisseur (optionnel)'}
                      value={form.supplier_id}
                      onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value as string }))}
                    >
                      {tab === 'cond' ? (
                        <MenuItem value="">
                          <em>Aucun</em>
                        </MenuItem>
                      ) : null}
                      {sup.map(s => (
                        <MenuItem key={s.id} value={s.id}>
                          {s.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {tab === 'cond' ? (
                    <div className="flex flex-wrap gap-2">
                      <TextField
                        label="Hauteur (mm)"
                        value={form.h}
                        onChange={e => setForm(f => ({ ...f, h: e.target.value }))}
                        size="small"
                        slotProps={muiSlotPropsDecimalKeypad}
                      />
                      <TextField
                        label="Largeur (mm)"
                        value={form.w}
                        onChange={e => setForm(f => ({ ...f, w: e.target.value }))}
                        size="small"
                        slotProps={muiSlotPropsDecimalKeypad}
                      />
                      <TextField
                        label="Profondeur (mm)"
                        value={form.d}
                        onChange={e => setForm(f => ({ ...f, d: e.target.value }))}
                        size="small"
                        slotProps={muiSlotPropsDecimalKeypad}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="contained" onClick={() => void save()}>
              Enregistrer
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </div>
  )
}
