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
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import BackNavButton from '@/components/BackNavButton'
import FormDialog from '@/lib/mui/FormDialog'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type {
  RefConditionnementRow,
  RefRow,
  RefShopOrderUnitRow,
  RefSubcategoryRow,
  RefSupplierRow,
  RefVendeurRow,
} from '@/lib/products/types'
import { parseDeviseAchat, type DeviseAchat } from '@/lib/commandes-fournisseur/achat-devise'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import AutomatedTasksAdminPanel from './AutomatedTasksAdminPanel'
import MagasinsAdminPanel from './MagasinsAdminPanel'
import StatusLabelsAdminPanel from './StatusLabelsAdminPanel'
import StockAdminPanel from './StockAdminPanel'
import TranslationsAdminPanel from './TranslationsAdminPanel'
import ChauffeurAdminPanel from './ChauffeurAdminPanel'
import ChargesMagasinsAdminPanel from './ChargesMagasinsAdminPanel'
import ShopDeliveryZoneAdminPanel from './ShopDeliveryZoneAdminPanel'

type TabId =
  | 'udv'
  | 'udc'
  | 'uda'
  | 'ucv'
  | 'cat'
  | 'sup'
  | 'cond'
  | 'vend'
  | 'commandes'
  | 'charges'
  | 'livraison'
  | 'stock'
  | 'traductions'
  | 'taches'
  | 'comptes'

const tabLabels: Record<TabId, string> = {
  udv: 'Unités de vente',
  udc: 'Unités de commande',
  uda: "Unités d'achat",
  ucv: 'Unités commande vitrine',
  cat: 'Catégories',
  sup: 'Fournisseurs',
  cond: 'Conditionnements',
  vend: 'Vendeurs',
  commandes: 'Commandes',
  charges: 'Charges Magasins',
  livraison: 'Zone livraison',
  stock: 'Stock',
  traductions: 'Traductions',
  taches: 'Tâches automatisées',
  comptes: 'Administration',
}

const deleteConfirmPhrase: Partial<Record<TabId, string>> = {
  udv: 'cette unité de vente',
  udc: 'cette unité de commande',
  uda: "cette unité d'achat",
  ucv: 'cette unité commande vitrine',
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

export default function ParametresClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const { isAdministrator, canAdminUsers, canAdminRoles, canAdminMagasins } = useSessionPermissions()
  const showComptesTab = isAdministrator
  const showTachesTab = isAdministrator
  const tabOrder = useMemo(() => {
    const base: TabId[] = [
      'udv',
      'udc',
      'uda',
      'ucv',
      'cat',
      'sup',
      'cond',
      'vend',
      'commandes',
      'charges',
      'livraison',
      'stock',
      'traductions',
    ]
    if (showTachesTab) base.push('taches')
    if (showComptesTab) base.push('comptes')
    return base
  }, [showComptesTab, showTachesTab])
  const [tab, setTab] = useState<TabId>('udv')
  const [udv, setUdv] = useState<RefRow[]>([])
  const [udc, setUdc] = useState<RefRow[]>([])
  const [uda, setUda] = useState<RefRow[]>([])
  const [ucv, setUcv] = useState<RefShopOrderUnitRow[]>([])
  const [cat, setCat] = useState<RefRow[]>([])
  const [subcats, setSubcats] = useState<RefSubcategoryRow[]>([])
  const [sup, setSup] = useState<RefSupplierRow[]>([])
  const [cond, setCond] = useState<RefConditionnementRow[]>([])
  const [vendeurs, setVendeurs] = useState<RefVendeurRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<
    RefRow | RefSupplierRow | RefConditionnementRow | RefVendeurRow | RefShopOrderUnitRow | null
  >(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmTarget | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [subcatOpen, setSubcatOpen] = useState(false)
  const [subcatEditing, setSubcatEditing] = useState<RefSubcategoryRow | null>(null)
  const [subcatIsNew, setSubcatIsNew] = useState(false)
  const [subcatForm, setSubcatForm] = useState({ label: '', label_ar: '', category_id: '' })
  const [form, setForm] = useState({
    label: '',
    label_ar: '',
    h: '',
    w: '',
    d: '',
    supplier_id: '',
    commande_active: true,
    phone: '',
    preferred_locale: 'fr' as 'fr' | 'ar-MA',
    devise_achat: 'dirham' as DeviseAchat,
    piece_qty: '1',
  })

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    const [a, udcRes, udaRes, ucvRes, b, sc, c, d, e] = await Promise.all([
      supabase.from('ref_sales_unit').select('*').order('sort_order'),
      supabase.from('ref_order_unit').select('*').order('sort_order'),
      supabase.from('ref_purchase_unit').select('*').order('sort_order'),
      supabase.from('ref_shop_order_unit').select('*').order('sort_order'),
      supabase.from('ref_category').select('*').order('sort_order'),
      supabase.from('ref_subcategory').select('*, ref_category(id, label)').order('sort_order').order('label'),
      supabase.from('ref_supplier').select('*').order('sort_order'),
      supabase.from('ref_conditionnement').select('*, ref_supplier(id, code, label)').order('sort_order'),
      supabase
        .from('ref_supplier_vendeur')
        .select('*, ref_supplier(id, code, label)')
        .order('sort_order')
        .order('label'),
    ])
    const firstErr =
      a.error ??
      udcRes.error ??
      udaRes.error ??
      ucvRes.error ??
      b.error ??
      sc.error ??
      c.error ??
      d.error ??
      e.error
    if (firstErr) setErr(firstErr.message)
    setUdv((a.data as RefRow[]) ?? [])
    setUdc((udcRes.data as RefRow[]) ?? [])
    setUda((udaRes.data as RefRow[]) ?? [])
    setUcv((ucvRes.data as RefShopOrderUnitRow[]) ?? [])
    setCat((b.data as RefRow[]) ?? [])
    setSubcats((sc.data as RefSubcategoryRow[]) ?? [])
    setSup(
      ((c.data as RefSupplierRow[]) ?? []).map(row => ({
        ...row,
        commande_active: row.commande_active !== false,
      })),
    )
    setCond((d.data as RefConditionnementRow[]) ?? [])
    setVendeurs((e.data as RefVendeurRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showComptesTab && tab === 'comptes') setTab('udv')
    if (!showTachesTab && tab === 'taches') setTab('udv')
  }, [showComptesTab, showTachesTab, tab])

  const openNewSubcat = () => {
    setSubcatIsNew(true)
    setSubcatEditing(null)
    setSubcatForm({ label: '', label_ar: '', category_id: cat[0]?.id ?? '' })
    setSubcatOpen(true)
  }

  const openSubcatRow = (r: RefSubcategoryRow) => {
    setSubcatIsNew(false)
    setSubcatEditing(r)
    setSubcatForm({
      label: r.label,
      label_ar: typeof r.label_ar === 'string' ? r.label_ar : '',
      category_id: r.category_id,
    })
    setSubcatOpen(true)
  }

  const saveSubcat = async () => {
    setErr(null)
    const label = subcatForm.label.trim()
    const labelArTrim = subcatForm.label_ar.trim()
    const categoryId = subcatForm.category_id.trim()
    if (!label || !categoryId) {
      setErr('Libellé et catégorie requis pour une sous-catégorie.')
      return
    }
    const payload = {
      label,
      label_ar: labelArTrim.length > 0 ? labelArTrim : null,
      category_id: categoryId,
    }
    if (subcatIsNew) {
      const { error: e0 } = await supabase
        .from('ref_subcategory')
        .insert(payload as never)
      if (e0) {
        setErr(e0.message)
        return
      }
    } else if (subcatEditing) {
      const { error: e0 } = await supabase
        .from('ref_subcategory')
        .update(payload as never)
        .eq('id', subcatEditing.id)
      if (e0) {
        setErr(e0.message)
        return
      }
    }
    setSubcatOpen(false)
    void load()
  }

  const requestDeleteSubcat = (row: RefSubcategoryRow) => {
    setDeleteConfirm({ tab: 'cat', id: row.id, label: row.label })
  }

  const openNew = () => {
    setIsNew(true)
    if (tab === 'vend') {
      setEditing({ id: '', supplier_id: sup[0]?.id ?? '', label: '', sort_order: 0 } as RefVendeurRow)
      setForm({
        label: '',
        label_ar: '',
        h: '',
        w: '',
        d: '',
        supplier_id: sup[0]?.id ?? '',
        commande_active: true,
        phone: '',
        preferred_locale: 'fr',
        devise_achat: 'dirham',
        piece_qty: '1',
      })
    } else {
      setEditing({ id: '', code: '', label: '', sort_order: 0, created_at: '', commande_active: true } as RefSupplierRow)
      setForm({
        label: '',
        label_ar: '',
        h: '',
        w: '',
        d: '',
        supplier_id: '',
        commande_active: true,
        phone: '',
        preferred_locale: 'fr',
        devise_achat: 'dirham',
        piece_qty: '1',
      })
    }
    setOpen(true)
  }

  const openRow = (
    r: RefRow | RefConditionnementRow | RefVendeurRow | RefSupplierRow | RefShopOrderUnitRow,
  ) => {
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
      commande_active:
        'commande_active' in r && typeof r.commande_active === 'boolean' ? r.commande_active : true,
      phone: 'phone' in r && typeof r.phone === 'string' ? r.phone : '',
      preferred_locale:
        'preferred_locale' in r && r.preferred_locale === 'ar-MA' ? 'ar-MA' : 'fr',
      devise_achat:
        'devise_achat' in r ? parseDeviseAchat(r.devise_achat) : 'dirham',
      piece_qty: 'piece_qty' in r && r.piece_qty != null ? String(r.piece_qty) : '1',
    })
    setOpen(true)
  }

  const toggleSupCommande = async (row: RefSupplierRow, active: boolean) => {
    setErr(null)
    const { error: e0 } = await supabase.from('ref_supplier').update({ commande_active: active }).eq('id', row.id)
    if (e0) {
      setErr(e0.message)
      return
    }
    setSup(prev => prev.map(s => (s.id === row.id ? { ...s, commande_active: active } : s)))
  }

  const moveCategory = async (id: string, direction: -1 | 1) => {
    setErr(null)
    const sorted = [...cat].sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label, 'fr'),
    )
    const idx = sorted.findIndex(c => c.id === id)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return

    const next = [...sorted]
    const tmp = next[idx]!
    next[idx] = next[swapIdx]!
    next[swapIdx] = tmp

    const updates = next.map((c, i) => ({ id: c.id, sort_order: i + 1 }))
    const results = await Promise.all(
      updates.map(u =>
        supabase.from('ref_category').update({ sort_order: u.sort_order } as never).eq('id', u.id),
      ),
    )
    const firstErr = results.find(r => r.error)?.error
    if (firstErr) {
      setErr(firstErr.message)
      return
    }
    setCat(next.map((c, i) => ({ ...c, sort_order: i + 1 })))
  }

  const tableName = (t: TabId) => {
    if (t === 'udv') return 'ref_sales_unit'
    if (t === 'udc') return 'ref_order_unit'
    if (t === 'uda') return 'ref_purchase_unit'
    if (t === 'ucv') return 'ref_shop_order_unit'
    if (t === 'cat') return 'ref_category'
    if (t === 'sup') return 'ref_supplier'
    if (t === 'vend') return 'ref_supplier_vendeur'
    if (t === 'cond') return 'ref_conditionnement'
    return 'ref_sales_unit'
  }

  const save = async () => {
    if (
      !editing ||
      tab === 'comptes' ||
      tab === 'taches' ||
      tab === 'stock' ||
      tab === 'traductions' ||
      tab === 'commandes' ||
      tab === 'charges' ||
      tab === 'livraison'
    )
      return
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
    } else if (tab === 'ucv') {
      const labelArTrim = form.label_ar.trim()
      const pieceQty = Number(form.piece_qty.replace(',', '.'))
      if (!(pieceQty > 0)) {
        setErr('La quantité de pièces doit être un nombre > 0 (ex. 0,25 ou 6).')
        return
      }
      const payload = {
        label: form.label.trim(),
        label_ar: labelArTrim.length > 0 ? labelArTrim : null,
        piece_qty: pieceQty,
      }
      if (isNew) {
        const { error: e0 } = await supabase.from('ref_shop_order_unit').insert(payload as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from('ref_shop_order_unit')
          .update(payload as never)
          .eq('id', editing.id)
        if (e0) {
          setErr(e0.message)
          return
        }
      }
    } else if (tab === 'cat' || tab === 'udv' || tab === 'udc' || tab === 'uda') {
      const labelArTrim = form.label_ar.trim()
      const payload: { label: string; label_ar: string | null; sort_order?: number } = {
        label: form.label.trim(),
        label_ar: labelArTrim.length > 0 ? labelArTrim : null,
      }
      if (isNew && tab === 'cat') {
        const maxOrder = cat.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0)
        payload.sort_order = maxOrder + 1
      }
      if (isNew) {
        const { error: e0 } = await supabase.from(tableName(tab)).insert(payload as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from(tableName(tab))
          .update(payload as never)
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
      const phoneTrim = form.phone.trim()
      const payload = {
        supplier_id: supplierId,
        label: form.label.trim(),
        phone: phoneTrim.length > 0 ? phoneTrim : null,
        preferred_locale: form.preferred_locale,
        devise_achat: form.devise_achat,
      }
      if (isNew) {
        const { error: e0 } = await supabase.from('ref_supplier_vendeur').insert(payload as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from('ref_supplier_vendeur')
          .update(payload as never)
          .eq('id', editing.id)
        if (e0) {
          setErr(e0.message)
          return
        }
      }
    } else if (tab === 'sup') {
      const payload = {
        label: form.label.trim(),
        commande_active: form.commande_active,
      }
      if (isNew) {
        const { error: e0 } = await supabase.from('ref_supplier').insert(payload as never)
        if (e0) {
          setErr(e0.message)
          return
        }
      } else {
        const { error: e0 } = await supabase
          .from('ref_supplier')
          .update(payload as never)
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
    if (
      tab === 'comptes' ||
      tab === 'taches' ||
      tab === 'stock' ||
      tab === 'traductions' ||
      tab === 'commandes' ||
      tab === 'charges' ||
      tab === 'livraison'
    )
      return
    setDeleteConfirm({ tab, id: row.id, label: row.label })
  }

  const executeDelete = async () => {
    if (!deleteConfirm) return
    const target = deleteConfirm
    setDeleteBusy(true)
    setErr(null)
    const isSubcat = subcats.some(sc => sc.id === target.id)
    const t = isSubcat ? 'ref_subcategory' : tableName(target.tab)
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
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <BackNavButton href="/" size="small">
            Accueil
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a', mt: 1, mb: 2 }}>
            Paramètres
          </Typography>
          <p className="text-slate-600">Chargement…</p>
        </div>
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
        {tab !== 'comptes' &&
        tab !== 'taches' &&
        tab !== 'stock' &&
        tab !== 'traductions' &&
        tab !== 'commandes' &&
        tab !== 'charges' &&
        tab !== 'livraison' ? (
          <Button variant="contained" color="success" onClick={openNew} sx={{ mb: 2, textTransform: 'none' }}>
            Ajouter — {tabLabels[tab]}
          </Button>
        ) : null}
        {tab === 'traductions' ? <TranslationsAdminPanel /> : null}
        {tab === 'commandes' ? <ChauffeurAdminPanel /> : null}
        {tab === 'charges' ? <ChargesMagasinsAdminPanel /> : null}
        {tab === 'livraison' ? <ShopDeliveryZoneAdminPanel /> : null}
        {tab === 'taches' ? <AutomatedTasksAdminPanel /> : null}
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
        {tab === 'udv' && (
          <RefTable
            title="Unités de vente"
            rows={udv}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Libellé arabe',
                render: r => {
                  const ar = (r as RefRow).label_ar?.trim()
                  return ar && ar.length > 0 ? (
                    <span dir="rtl" className="block text-right">
                      {ar}
                    </span>
                  ) : (
                    '—'
                  )
                },
              },
            ]}
          />
        )}
        {tab === 'udc' && (
          <RefTable
            title="Unités de commande"
            rows={udc}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Libellé arabe',
                render: r => {
                  const ar = (r as RefRow).label_ar?.trim()
                  return ar && ar.length > 0 ? (
                    <span dir="rtl" className="block text-right">
                      {ar}
                    </span>
                  ) : (
                    '—'
                  )
                },
              },
            ]}
          />
        )}
        {tab === 'uda' && (
          <RefTable
            title="Unités d'achat"
            rows={uda}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Libellé arabe',
                render: r => {
                  const ar = (r as RefRow).label_ar?.trim()
                  return ar && ar.length > 0 ? (
                    <span dir="rtl" className="block text-right">
                      {ar}
                    </span>
                  ) : (
                    '—'
                  )
                },
              },
            ]}
          />
        )}
        {tab === 'ucv' && (
          <RefTable
            title="Unités de commande vitrine (boutique)"
            rows={ucv}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Libellé arabe',
                render: r => {
                  const ar = (r as RefShopOrderUnitRow).label_ar?.trim()
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
                header: 'Qté pièces',
                render: r => String((r as RefShopOrderUnitRow).piece_qty),
              },
            ]}
          />
        )}
        {tab === 'cat' && (
          <>
            <RefTable
              title="Catégories"
              rows={cat}
              onEdit={openRow}
              onDelete={requestDelete}
              extras={[
                {
                  header: 'Libellé arabe',
                  render: r => {
                    const ar = (r as RefRow).label_ar?.trim()
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
                  header: 'Ordre',
                  render: r => {
                    const sorted = [...cat].sort(
                      (a, b) =>
                        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                        a.label.localeCompare(b.label, 'fr'),
                    )
                    const idx = sorted.findIndex(c => c.id === r.id)
                    return (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                        <IconButton
                          size="small"
                          aria-label="Monter"
                          disabled={idx <= 0}
                          onClick={() => void moveCategory(r.id, -1)}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Descendre"
                          disabled={idx < 0 || idx >= sorted.length - 1}
                          onClick={() => void moveCategory(r.id, 1)}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )
                  },
                },
              ]}
            />
            <Box sx={{ mt: 4 }}>
              <Button
                variant="contained"
                color="success"
                onClick={openNewSubcat}
                sx={{ mb: 2, textTransform: 'none' }}
              >
                Ajouter — sous-catégorie
              </Button>
              <RefTable
                title="Sous-catégories"
                rows={subcats}
                onEdit={openSubcatRow}
                onDelete={requestDeleteSubcat}
                extras={[
                  {
                    header: 'Libellé arabe',
                    render: r => {
                      const ar = (r as RefSubcategoryRow).label_ar?.trim()
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
                    header: 'Catégorie',
                    render: r => {
                      const row = r as RefSubcategoryRow
                      const rel = row.ref_category
                      if (rel && typeof rel === 'object' && 'label' in rel && !Array.isArray(rel)) {
                        return (rel as RefRow).label
                      }
                      return cat.find(c => c.id === row.category_id)?.label ?? '—'
                    },
                  },
                ]}
              />
            </Box>
          </>
        )}
        {tab === 'sup' && (
          <RefTable
            title="Fournisseurs"
            rows={sup}
            onEdit={openRow}
            onDelete={requestDelete}
            extras={[
              {
                header: 'Commande',
                render: r => {
                  const row = r as RefSupplierRow
                  return (
                    <Switch
                      size="small"
                      checked={row.commande_active !== false}
                      onChange={(_, checked) => void toggleSupCommande(row, checked)}
                      slotProps={{ input: { 'aria-label': `Commandes pour ${row.label}` } }}
                    />
                  )
                },
              },
            ]}
          />
        )}
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
              {
                header: 'Téléphone',
                render: r => {
                  const phone = (r as RefVendeurRow).phone?.trim()
                  return phone && phone.length > 0 ? phone : '—'
                },
              },
              {
                header: 'Langue commande',
                render: r => {
                  const loc = (r as RefVendeurRow).preferred_locale
                  return loc === 'ar-MA' ? 'Arabe' : 'Français'
                },
              },
              {
                header: 'Devise achat',
                render: r => {
                  const d = parseDeviseAchat((r as RefVendeurRow).devise_achat)
                  return d === 'rial' ? 'Rial' : 'Dirham'
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

        <FormDialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{isNew ? 'Ajouter' : 'Modifier'}</DialogTitle>
          <DialogContent>
            <div className="mt-1 flex flex-col gap-4">
              <TextField label="Libellé" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} size="small" fullWidth />
              {tab === 'cond' || tab === 'cat' || tab === 'udv' || tab === 'udc' || tab === 'uda' || tab === 'ucv' ? (
                <TextField
                  label="Libellé arabe"
                  value={form.label_ar}
                  onChange={e => setForm(f => ({ ...f, label_ar: e.target.value }))}
                  size="small"
                  fullWidth
                  slotProps={{ input: { dir: 'rtl' } }}
                />
              ) : null}
              {tab === 'ucv' ? (
                <TextField
                  label="Quantité de pièces"
                  value={form.piece_qty}
                  onChange={e => setForm(f => ({ ...f, piece_qty: e.target.value }))}
                  size="small"
                  fullWidth
                  helperText="Ex. 0,25 pour 1/4 pièce, 6 pour un lot de 6"
                  slotProps={muiSlotPropsDecimalKeypad}
                />
              ) : null}
              {tab === 'sup' ? (
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.commande_active}
                      onChange={(_, checked) => setForm(f => ({ ...f, commande_active: checked }))}
                    />
                  }
                  label="Commandes magasin activées"
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
                  {tab === 'vend' ? (
                    <>
                      <TextField
                        label="Téléphone WhatsApp"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        size="small"
                        fullWidth
                        placeholder="212612345678 ou 0612345678"
                        helperText="Indicatif pays recommandé (212…). Un 0 initial local est converti automatiquement."
                      />
                      <FormControl size="small" fullWidth>
                        <InputLabel id="vendeur-locale-label">Langue export commande</InputLabel>
                        <Select
                          labelId="vendeur-locale-label"
                          label="Langue export commande"
                          value={form.preferred_locale}
                          onChange={e =>
                            setForm(f => ({
                              ...f,
                              preferred_locale: e.target.value as 'fr' | 'ar-MA',
                            }))
                          }
                        >
                          <MenuItem value="fr">Français</MenuItem>
                          <MenuItem value="ar-MA">Arabe</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small" fullWidth>
                        <InputLabel id="vendeur-devise-label">Devise achat</InputLabel>
                        <Select
                          labelId="vendeur-devise-label"
                          label="Devise achat"
                          value={form.devise_achat}
                          onChange={e =>
                            setForm(f => ({
                              ...f,
                              devise_achat: parseDeviseAchat(e.target.value),
                            }))
                          }
                        >
                          <MenuItem value="dirham">Dirham</MenuItem>
                          <MenuItem value="rial">Rial (1 DH = 20 Rial)</MenuItem>
                        </Select>
                      </FormControl>
                    </>
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
        </FormDialog>

        <FormDialog open={subcatOpen} onClose={() => setSubcatOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{subcatIsNew ? 'Ajouter une sous-catégorie' : 'Modifier la sous-catégorie'}</DialogTitle>
          <DialogContent>
            <div className="mt-1 flex flex-col gap-4">
              <FormControl size="small" fullWidth required>
                <InputLabel id="subcat-category-label">Catégorie</InputLabel>
                <Select
                  labelId="subcat-category-label"
                  label="Catégorie"
                  value={subcatForm.category_id}
                  onChange={e => setSubcatForm(f => ({ ...f, category_id: e.target.value }))}
                >
                  {cat.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Libellé"
                value={subcatForm.label}
                onChange={e => setSubcatForm(f => ({ ...f, label: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Libellé arabe"
                value={subcatForm.label_ar}
                onChange={e => setSubcatForm(f => ({ ...f, label_ar: e.target.value }))}
                size="small"
                fullWidth
                slotProps={{ input: { dir: 'rtl' } }}
              />
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSubcatOpen(false)} sx={{ textTransform: 'none' }}>
              Annuler
            </Button>
            <Button variant="contained" onClick={() => void saveSubcat()} sx={{ textTransform: 'none' }}>
              Enregistrer
            </Button>
          </DialogActions>
        </FormDialog>
      </div>
    </div>
  )
}
