'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import AppLink from '@/components/AppLink'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { defaultMargin } from '@/lib/products/margin'
import { productPhotoPublicUrl, removeProductPhoto, uploadProductPhoto } from '@/lib/products/storage'
import type {
  ProductPackagingRow,
  ProductPriceHistoryRow,
  ProductRow,
  RefConditionnementRow,
  RefRow,
} from '@/lib/products/types'
import { useRouter } from 'next/navigation'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'

type Props = { productId: string | null }

type PackagingLine = ProductPackagingRow & {
  ref_conditionnement: RefConditionnementRow | null
  ref_sales_unit: RefRow | null
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function ProductFormClient({ productId }: Props) {
  const isNew = productId == null
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [units, setUnits] = useState<RefRow[]>([])
  const [cats, setCats] = useState<RefRow[]>([])
  const [sups, setSups] = useState<RefRow[]>([])
  const [conds, setConds] = useState<RefConditionnementRow[]>([])

  const [p, setP] = useState<Partial<ProductRow> & { id?: string }>({
    name: '',
    price: 0,
    name_ar: '',
    cost_purchase: null,
    cost_manufacturing: null,
    cost_packaging: null,
    margin: null,
    active: true,
    visible_vitrine: true,
  })
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [packs, setPacks] = useState<PackagingLine[]>([])
  const [hist, setHist] = useState<ProductPriceHistoryRow[]>([])

  const [addCond, setAddCond] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addUnit, setAddUnit] = useState('')

  const loadRefs = useCallback(async () => {
    const [u, c, s, co] = await Promise.all([
      supabase.from('ref_sales_unit').select('*').order('sort_order'),
      supabase.from('ref_category').select('*').order('sort_order'),
      supabase.from('ref_supplier').select('*').order('sort_order'),
      supabase.from('ref_conditionnement').select('*').order('sort_order'),
    ])
    if (u.data) {
      setUnits(u.data as RefRow[])
      if (u.data[0] && isNew) setP(x => ({ ...x, sales_unit_id: (u.data[0] as RefRow).id }))
    }
    if (c.data) {
      setCats(c.data as RefRow[])
      if (c.data[0] && isNew) setP(x => ({ ...x, category_id: (c.data[0] as RefRow).id }))
    }
    if (s.data) {
      setSups(s.data as RefRow[])
      if (s.data[0] && isNew) setP(x => ({ ...x, supplier_id: (s.data[0] as RefRow).id }))
    }
    if (co.data) {
      setConds(co.data as RefConditionnementRow[])
      if (co.data[0]) setAddCond((co.data[0] as RefConditionnementRow).id)
    }
    if (u.data?.[0]) setAddUnit((u.data[0] as RefRow).id)
  }, [supabase, isNew])

  const loadProduct = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    setErr(null)
    const { data, error: e0 } = await supabase
      .from('product')
      .select('*, ref_sales_unit(*), ref_category(*), ref_supplier(*)')
      .eq('id', productId)
      .maybeSingle()
    if (e0 || !data) {
      setErr(e0?.message ?? 'Produit introuvable')
      setLoading(false)
      return
    }
    const row = data as ProductRow
    setP(row)
    setImageUrl(productPhotoPublicUrl(supabase, row.image_path))
    const { data: ph } = await supabase
      .from('product_price_history')
      .select('*')
      .eq('product_id', productId)
      .order('valid_from', { ascending: false })
    setHist((ph as ProductPriceHistoryRow[]) ?? [])
    const { data: pg } = await supabase
      .from('product_packaging')
      .select('*, ref_conditionnement(*), ref_sales_unit(*)')
      .eq('product_id', productId)
    setPacks((pg as PackagingLine[]) ?? [])
    setLoading(false)
  }, [supabase, productId])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    if (productId) void loadProduct()
  }, [productId, loadProduct])

  useEffect(() => {
    const base = "O' Petit Frais"
    if (isNew) {
      document.title = `Nouveau produit | ${base}`
    } else if (!loading) {
      const label = p.name?.trim() || (p.code != null ? `Produit ${p.code}` : 'Fiche produit')
      document.title = `${label} | ${base}`
    } else {
      document.title = base
    }
    return () => {
      document.title = base
    }
  }, [isNew, loading, p.name, p.code])

  const applyDefaultMargin = () => {
    const price = p.price != null ? Number(p.price) : 0
    setP(x => ({
      ...x,
      margin: defaultMargin({
        price,
        costPurchase: p.cost_purchase ?? null,
        costManufacturing: p.cost_manufacturing ?? null,
        costPackaging: p.cost_packaging ?? null,
      }),
    }))
  }

  const save = async () => {
    if (!p.name?.trim()) {
      setErr('Le nom est obligatoire')
      return
    }
    if (p.sales_unit_id == null || p.category_id == null || p.supplier_id == null) {
      setErr('UdV, catégorie et fournisseur sont obligatoires')
      return
    }
    setSaving(true)
    setErr(null)
    const payload = {
      name: p.name.trim(),
      price: Number(p.price) || 0,
      sales_unit_id: p.sales_unit_id!,
      category_id: p.category_id!,
      supplier_id: p.supplier_id!,
      name_ar: p.name_ar || null,
      cost_purchase: p.cost_purchase,
      cost_manufacturing: p.cost_manufacturing,
      cost_packaging: p.cost_packaging,
      margin: p.margin,
      image_path: p.image_path ?? null,
      active: p.active ?? true,
      visible_vitrine: p.visible_vitrine ?? true,
    }
    if (isNew) {
      const { data, error: e1 } = await supabase
        .from('product')
        .insert({
          ...payload,
        } as never)
        .select('id')
        .single()
      if (e1) {
        setErr(e1.message)
        setSaving(false)
        return
      }
      const newId = (data as { id: string }).id
      router.replace(`/produits/${newId}`)
      setSaving(false)
      return
    }
    const { error: e2 } = await supabase.from('product').update(payload as never).eq('id', productId!)
    if (e2) {
      setErr(e2.message)
      setSaving(false)
      return
    }
    await loadProduct()
    setSaving(false)
  }

  const onFile = async (f: File | null) => {
    if (!f || !productId) {
      if (!f && p.image_path) {
        await removeProductPhoto(supabase, p.image_path)
        await supabase.from('product').update({ image_path: null } as never).eq('id', productId ?? '')
        setP(x => ({ ...x, image_path: null }))
        setImageUrl(null)
      }
      return
    }
    if (isNew) {
      setErr('Enregistrez d’abord le produit, puis ajoutez la photo.')
      return
    }
    if (p.image_path) {
      await removeProductPhoto(supabase, p.image_path)
    }
    const { path, error: e } = await uploadProductPhoto(supabase, productId, f)
    if (e || !path) {
      setErr(e ?? 'Upload impossible')
      return
    }
    await supabase.from('product').update({ image_path: path } as never).eq('id', productId)
    setP(x => ({ ...x, image_path: path }))
    setImageUrl(productPhotoPublicUrl(supabase, path))
  }

  const addPackaging = async () => {
    if (!productId) {
      setErr('Enregistrez le produit avant d’ajouter un conditionnement.')
      return
    }
    const q = num(addQty)
    if (q == null || q <= 0 || !addCond || !addUnit) {
      setErr('Conditionnement, quantité > 0 et unité requis.')
      return
    }
    setErr(null)
    const { error: e1 } = await supabase.from('product_packaging').insert({
      product_id: productId,
      conditionnement_id: addCond,
      quantity: q,
      sales_unit_id: addUnit,
    } as never)
    if (e1) {
      setErr(e1.message)
      return
    }
    const { data: pg } = await supabase
      .from('product_packaging')
      .select('*, ref_conditionnement(*), ref_sales_unit(*)')
      .eq('product_id', productId)
    setPacks((pg as PackagingLine[]) ?? [])
  }

  const removePack = async (id: string) => {
    const { error: e1 } = await supabase.from('product_packaging').delete().eq('id', id)
    if (e1) {
      setErr(e1.message)
      return
    }
    setPacks(prev => prev.filter(x => x.id !== id))
  }

  if (loading)
    return (
      <div className="p-6">
        <p className="text-slate-600">Chargement…</p>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Typography variant="h4" className="!font-semibold" component="h1">
            {isNew ? 'Nouveau produit' : p.name?.trim() || (p.code != null ? `Produit ${p.code}` : 'Fiche produit')}
          </Typography>
          <Button component={AppLink} href="/produits" size="small" sx={{ textTransform: 'none' }}>
            Liste produits
          </Button>
        </div>
        {err ? (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">{err}</div>
        ) : null}

        <div className="flex flex-col gap-4">
          {!isNew ? (
            <TextField size="small" label="Code" value={p.code ?? ''} disabled fullWidth />
          ) : null}
          <TextField
            required
            label="Nom"
            value={p.name ?? ''}
            onChange={e => setP(x => ({ ...x, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Nom (arabe)"
            value={p.name_ar ?? ''}
            onChange={e => setP(x => ({ ...x, name_ar: e.target.value }))}
            fullWidth
            slotProps={{ input: { dir: 'rtl' } }}
          />
          <TextField
            type="text"
            label="Prix de vente (DH)"
            value={p.price != null ? String(p.price) : ''}
            onChange={e => {
              const n = num(e.target.value)
              setP(x => ({ ...x, price: n != null ? n : 0 }))
            }}
            fullWidth
            slotProps={muiSlotPropsDecimalKeypad}
          />
          <FormControl fullWidth>
            <InputLabel>Unité de vente</InputLabel>
            <Select
              value={p.sales_unit_id ?? ''}
              label="Unité de vente"
              onChange={e => setP(x => ({ ...x, sales_unit_id: e.target.value }))}
            >
              {units.map(u => (
                <MenuItem key={u.id} value={u.id}>
                  {u.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Catégorie</InputLabel>
            <Select
              value={p.category_id ?? ''}
              label="Catégorie"
              onChange={e => setP(x => ({ ...x, category_id: e.target.value }))}
            >
              {cats.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Fournisseur</InputLabel>
            <Select
              value={p.supplier_id ?? ''}
              label="Fournisseur"
              onChange={e => setP(x => ({ ...x, supplier_id: e.target.value }))}
            >
              {sups.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            type="text"
            label="Prix achat"
            value={p.cost_purchase != null ? String(p.cost_purchase) : ''}
            onChange={e => {
              const n = num(e.target.value)
              setP(x => ({ ...x, cost_purchase: n }))
            }}
            fullWidth
            slotProps={muiSlotPropsDecimalKeypad}
          />
          <TextField
            type="text"
            label="Prix fabrication"
            value={p.cost_manufacturing != null ? String(p.cost_manufacturing) : ''}
            onChange={e => {
              const n = num(e.target.value)
              setP(x => ({ ...x, cost_manufacturing: n }))
            }}
            fullWidth
            slotProps={muiSlotPropsDecimalKeypad}
          />
          <TextField
            type="text"
            label="Prix emballage"
            value={p.cost_packaging != null ? String(p.cost_packaging) : ''}
            onChange={e => {
              const n = num(e.target.value)
              setP(x => ({ ...x, cost_packaging: n }))
            }}
            fullWidth
            slotProps={muiSlotPropsDecimalKeypad}
          />
          <div className="flex flex-wrap items-center gap-2">
            <TextField
              type="text"
              label="Marge (DH)"
              value={p.margin != null ? String(p.margin) : ''}
              onChange={e => {
                const n = num(e.target.value)
                setP(x => ({ ...x, margin: n }))
              }}
              sx={{ flex: 1, minWidth: 160 }}
              slotProps={muiSlotPropsDecimalKeypad}
            />
            <Button type="button" variant="outlined" size="small" onClick={applyDefaultMargin} sx={{ textTransform: 'none' }}>
              Remplir (vente − coûts)
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            <FormControlLabel
              control={
                <Checkbox
                  checked={p.active ?? true}
                  onChange={e => setP(x => ({ ...x, active: e.target.checked }))}
                />
              }
              label="Actif"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={p.visible_vitrine ?? true}
                  onChange={e => setP(x => ({ ...x, visible_vitrine: e.target.checked }))}
                />
              }
              label="Visible vitrine (futur)"
            />
          </div>

          {!isNew && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Photo
              </Typography>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="mb-2 max-h-40 rounded border" />
              ) : null}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={e => {
                  const f = e.target.files?.[0]
                  void onFile(f ?? null)
                  e.target.value = ''
                }}
              />
            </Box>
          )}

          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void save()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>

        {!isNew && productId ? (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Conditionnements
            </Typography>
            <div className="mb-2 flex flex-col flex-wrap items-stretch gap-2 sm:flex-row sm:items-end">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Conditionnement</InputLabel>
                <Select
                  value={addCond}
                  label="Conditionnement"
                  onChange={e => setAddCond(e.target.value)}
                >
                  {conds.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Quantité"
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
                sx={{ width: 100 }}
                slotProps={muiSlotPropsDecimalKeypad}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>UdV</InputLabel>
                <Select
                  value={addUnit}
                  label="UdV"
                  onChange={e => setAddUnit(e.target.value)}
                >
                  {units.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button type="button" variant="outlined" size="small" onClick={() => void addPackaging()} sx={{ textTransform: 'none' }}>
                Ajouter
              </Button>
            </div>
            <table className="w-full text-sm border border-slate-200 rounded">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600">
                  <th className="p-2">Conditionnement</th>
                  <th className="p-2">Qté</th>
                  <th className="p-2">UdV</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {packs.map(x => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="p-2">{(x.ref_conditionnement as RefConditionnementRow | null)?.label ?? '—'}</td>
                    <td className="p-2">{String(x.quantity)}</td>
                    <td className="p-2">{(x.ref_sales_unit as RefRow | null)?.label ?? '—'}</td>
                    <td className="p-2">
                      <Button size="small" color="error" onClick={() => void removePack(x.id)} sx={{ textTransform: 'none' }}>
                        Retirer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        ) : null}

        {!isNew && hist.length > 0 ? (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Historique des prix
            </Typography>
            <table className="w-full text-sm border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600">
                  <th className="p-2">Date</th>
                  <th className="p-2">Prix vente</th>
                  <th className="p-2">Prix achat</th>
                </tr>
              </thead>
              <tbody>
                {hist.map(h => (
                  <tr key={h.id} className="border-t">
                    <td className="p-2">
                      {new Date(h.valid_from).toLocaleString('fr-FR', { timeZone: 'UTC' })}
                    </td>
                    <td className="p-2">
                      {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(h.price)} DH
                    </td>
                    <td className="p-2">
                      {h.cost_purchase != null
                        ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(h.cost_purchase)} DH`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        ) : null}
      </div>
    </div>
  )
}
