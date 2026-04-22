'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import AppLink from '@/components/AppLink'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { RefConditionnementRow, RefRow } from '@/lib/products/types'

type TabId = 'udv' | 'cat' | 'sup' | 'cond'

const tabLabels: Record<TabId, string> = {
  udv: 'Unités de vente',
  cat: 'Catégories',
  sup: 'Fournisseurs',
  cond: 'Conditionnements',
}

function RefTable<T extends { id: string; code: string; label: string; sort_order: number }>({
  title,
  rows,
  onEdit,
  onDelete,
  extra,
}: {
  title: string
  rows: T[]
  onEdit: (r: T) => void
  onDelete: (id: string) => void
  extra?: (r: T) => ReactNode
}) {
  return (
    <div>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
        {title}
      </Typography>
      <div className="overflow-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase text-slate-600">
              <th className="p-2">Code</th>
              <th className="p-2">Libellé</th>
              <th className="p-2">Tri</th>
              {extra ? <th className="p-2">Détails</th> : null}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2">{r.label}</td>
                <td className="p-2">{r.sort_order}</td>
                {extra ? <td className="p-2 text-xs text-slate-600">{extra(r)}</td> : null}
                <td className="p-2 text-right">
                  <Button size="small" onClick={() => onEdit(r)} sx={{ textTransform: 'none' }}>
                    Modifier
                  </Button>
                  <Button size="small" color="error" onClick={() => onDelete(r.id)} sx={{ textTransform: 'none' }}>
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
  const [tab, setTab] = useState<TabId>('udv')
  const [udv, setUdv] = useState<RefRow[]>([])
  const [cat, setCat] = useState<RefRow[]>([])
  const [sup, setSup] = useState<RefRow[]>([])
  const [cond, setCond] = useState<RefConditionnementRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RefRow | RefConditionnementRow | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({
    code: '',
    label: '',
    sort_order: '0',
    h: '',
    w: '',
    d: '',
  })

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    const [a, b, c, d] = await Promise.all([
      supabase.from('ref_sales_unit').select('*').order('sort_order'),
      supabase.from('ref_category').select('*').order('sort_order'),
      supabase.from('ref_supplier').select('*').order('sort_order'),
      supabase.from('ref_conditionnement').select('*').order('sort_order'),
    ])
    if (a.error) setErr(a.error.message)
    setUdv((a.data as RefRow[]) ?? [])
    setCat((b.data as RefRow[]) ?? [])
    setSup((c.data as RefRow[]) ?? [])
    setCond((d.data as RefConditionnementRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setIsNew(true)
    setEditing({ id: '', code: '', label: '', sort_order: 0, created_at: '' } as RefRow)
    setForm({ code: '', label: '', sort_order: '0', h: '', w: '', d: '' })
    setOpen(true)
  }

  const openRow = (r: RefRow | RefConditionnementRow) => {
    setIsNew(false)
    setEditing(r)
    setForm({
      code: r.code,
      label: r.label,
      sort_order: String(r.sort_order),
      h: 'height_mm' in r && r.height_mm != null ? String(r.height_mm) : '',
      w: 'width_mm' in r && r.width_mm != null ? String(r.width_mm) : '',
      d: 'depth_mm' in r && r.depth_mm != null ? String(r.depth_mm) : '',
    })
    setOpen(true)
  }

  const tableName = (t: TabId) => {
    if (t === 'udv') return 'ref_sales_unit'
    if (t === 'cat') return 'ref_category'
    if (t === 'sup') return 'ref_supplier'
    return 'ref_conditionnement'
  }

  const save = async () => {
    if (!editing) return
    const sn = parseInt(form.sort_order, 10) || 0
    setErr(null)
    if (tab === 'cond') {
      const h = form.h ? Number(form.h) : null
      const w = form.w ? Number(form.w) : null
      const d = form.d ? Number(form.d) : null
      if (isNew) {
        const { error: e0 } = await supabase.from('ref_conditionnement').insert({
          code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
          label: form.label.trim(),
          sort_order: sn,
          height_mm: h,
          width_mm: w,
          depth_mm: d,
        } as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from('ref_conditionnement')
          .update({
            code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
            label: form.label.trim(),
            sort_order: sn,
            height_mm: h,
            width_mm: w,
            depth_mm: d,
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
          code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
          label: form.label.trim(),
          sort_order: sn,
        } as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from(tableName(tab))
          .update({
            code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
            label: form.label.trim(),
            sort_order: sn,
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

  const del = async (id: string) => {
    if (!confirm('Supprimer cette entrée ?')) return
    setErr(null)
    const t = tableName(tab)
    const { error: e0 } = await supabase.from(t).delete().eq('id', id)
    if (e0) setErr(e0.message)
    else void load()
  }

  if (loading)
    return (
      <div className="p-6">
        <p className="text-slate-600">Chargement…</p>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Typography variant="h4" className="!font-semibold" component="h1">
            Référentiel
          </Typography>
          <Button component={AppLink} href="/" size="small" sx={{ textTransform: 'none' }}>
            Accueil
          </Button>
        </div>
        {err ? <div className="mb-2 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{err}</div> : null}
        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v as TabId)
            setErr(null)
          }}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {(Object.keys(tabLabels) as TabId[]).map(k => (
            <Tab key={k} value={k} label={tabLabels[k]} />
          ))}
        </Tabs>
        <Button variant="contained" color="success" onClick={openNew} sx={{ mb: 2, textTransform: 'none' }}>
          Ajouter — {tabLabels[tab]}
        </Button>
        {tab === 'udv' && <RefTable title="Unités" rows={udv} onEdit={openRow} onDelete={del} />}
        {tab === 'cat' && <RefTable title="Catégories" rows={cat} onEdit={openRow} onDelete={del} />}
        {tab === 'sup' && <RefTable title="Fournisseurs" rows={sup} onEdit={openRow} onDelete={del} />}
        {tab === 'cond' && (
          <RefTable
            title="Conditionnements (dimensions en mm)"
            rows={cond}
            onEdit={openRow}
            onDelete={del}
            extra={r =>
              `${(r as RefConditionnementRow).height_mm ?? '—'} × ${(r as RefConditionnementRow).width_mm ?? '—'} × ${(r as RefConditionnementRow).depth_mm ?? '—'}`
            }
          />
        )}

        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{isNew ? 'Ajouter' : 'Modifier'}</DialogTitle>
          <DialogContent>
            <div className="mt-1 flex flex-col gap-4">
              <TextField
                label="Code (interne)"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                size="small"
                fullWidth
                helperText="Ex. : barq_500 (sans espace, unique)"
              />
              <TextField label="Libellé" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} size="small" fullWidth />
              <TextField
                label="Ordre d’affichage"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                size="small"
                type="number"
                fullWidth
              />
              {tab === 'cond' ? (
                <div className="flex flex-wrap gap-2">
                  <TextField
                    label="Hauteur (mm)"
                    value={form.h}
                    onChange={e => setForm(f => ({ ...f, h: e.target.value }))}
                    size="small"
                  />
                  <TextField
                    label="Largeur (mm)"
                    value={form.w}
                    onChange={e => setForm(f => ({ ...f, w: e.target.value }))}
                    size="small"
                  />
                  <TextField
                    label="Profondeur (mm)"
                    value={form.d}
                    onChange={e => setForm(f => ({ ...f, d: e.target.value }))}
                    size="small"
                  />
                </div>
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
