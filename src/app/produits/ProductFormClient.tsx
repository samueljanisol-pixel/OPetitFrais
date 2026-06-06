'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import BackNavButton from '@/components/BackNavButton'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { defaultMargin } from '@/lib/products/margin'
import { productPhotoPublicUrl, removeProductPhoto, uploadProductPhoto } from '@/lib/products/storage'
import type {
  ProductPackagingRow,
  ProductPriceHistoryRow,
  ProductRow,
  RefConditionnementRow,
  RefVendeurRow,
  RefRow,
} from '@/lib/products/types'
import { useRouter } from 'next/navigation'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import { insertProductPriceHistoryRow, pricingSnapshotChanged, type ProductPricingSnapshot } from '@/lib/products/priceHistory'
import { HISTORIQUE_FROM_ISO } from '@/lib/ca/constants'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { ProductPackagingSettingsDialog, type MagasinMini } from '@/app/produits/ProductPackagingSettingsDialog'
import { packagingConditionnementLabel } from '@/lib/commandes-fournisseur/product-display'
import { hasPackagingCombo, packagingDbErrorMessage } from '@/lib/products/packaging-errors'
import { productPackagingArchiveUpdate } from '@/lib/products/packaging-archive'

type Props = { productId: string | null; /** Retour après enregistrement (ex. parcours commande). */
  returnTo?: string | null }

const PACKAGING_SELECT =
  '*, ref_conditionnement(*), ref_sales_unit(*), product_packaging_magasin(magasin_id, sellable, purchasable), product_packaging_supplier(supplier_id), product_packaging_vendeur(vendeur_id)'

type PackagingLine = ProductPackagingRow & {
  ref_conditionnement: RefConditionnementRow | null
  ref_sales_unit: RefRow | null
  product_packaging_supplier?: Array<{ supplier_id: string }> | null
  product_packaging_vendeur?: Array<{ vendeur_id: string }> | null
  product_packaging_magasin?: Array<{ magasin_id: string; sellable: boolean; purchasable: boolean }> | null
}

const HIST_PAGE = 10

const num = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function ProductFormClient({ productId, returnTo = null }: Props) {
  const isNew = productId == null
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const { canWriteProducts, canCommandesFournisseurSaisie, loading: permLoading } =
    useSessionPermissions()
  const readOnly = !canWriteProducts
  /** Depuis le parcours commande : saisie autorisée sur les conditionnements sans produits.write. */
  const canEditPackaging =
    canWriteProducts || (returnTo != null && canCommandesFournisseurSaisie)
  const packagingReadOnly = !canEditPackaging
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
    allow_unit_in_commande: true,
  })
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [packs, setPacks] = useState<PackagingLine[]>([])
  const [vendeurs, setVendeurs] = useState<RefVendeurRow[]>([])
  const [magasins, setMagasins] = useState<MagasinMini[]>([])
  const [packDialog, setPackDialog] = useState<PackagingLine | null>(null)
  const [pendingRemovePack, setPendingRemovePack] = useState<PackagingLine | null>(null)
  const [removePackSaving, setRemovePackSaving] = useState(false)
  const [hist, setHist] = useState<ProductPriceHistoryRow[]>([])
  const [histError, setHistError] = useState<string | null>(null)
  const [histHasMore, setHistHasMore] = useState(false)
  const [histLoadingMore, setHistLoadingMore] = useState(false)
  const [retroDialogOpen, setRetroDialogOpen] = useState(false)
  const [retroDate, setRetroDate] = useState(HISTORIQUE_FROM_ISO)
  const [retroMargin, setRetroMargin] = useState('')
  const [retroSaving, setRetroSaving] = useState(false)
  const [retroErr, setRetroErr] = useState<string | null>(null)
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [addCond, setAddCond] = useState('')
  const [addNom, setAddNom] = useState('')
  const [addNomAr, setAddNomAr] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addUnit, setAddUnit] = useState('')
  const [addPackDialogOpen, setAddPackDialogOpen] = useState(false)
  const [addPackSaving, setAddPackSaving] = useState(false)
  const [addPackDialogErr, setAddPackDialogErr] = useState<string | null>(null)
  /** Dernier état tarifaire en base (historique si changement). */
  const lastPricingDbRef = useRef<ProductPricingSnapshot | null>(null)

  const vendeursProduit = useMemo(() => {
    const sid = p.supplier_id?.trim()
    if (!sid) return []
    return vendeurs.filter(v => v.supplier_id === sid)
  }, [vendeurs, p.supplier_id])

  const loadRefs = useCallback(async () => {
    const [u, c, s, co, ma, mg] = await Promise.all([
      supabase.from('ref_sales_unit').select('*').order('sort_order'),
      supabase.from('ref_category').select('*').order('sort_order'),
      supabase.from('ref_supplier').select('*').order('sort_order'),
      supabase.from('ref_conditionnement').select('*').order('sort_order'),
      supabase.from('ref_supplier_vendeur').select('id, supplier_id, label, sort_order').order('sort_order').order('label'),
      supabase.from('magasins').select('id, code, nom').order('sort_order'),
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
    if (ma.data) setVendeurs(ma.data as RefVendeurRow[])
    if (mg.data) setMagasins(mg.data as MagasinMini[])
    if (u.data?.[0]) setAddUnit((u.data[0] as RefRow).id)
  }, [supabase, isNew])

  const reloadPacks = useCallback(async () => {
    if (!productId) return
    const { data: pg } = await supabase
      .from('product_packaging')
      .select(PACKAGING_SELECT)
      .eq('product_id', productId)
      .is('archived_at', null)
    setPacks((pg as PackagingLine[]) ?? [])
  }, [supabase, productId])

  const loadProduct = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    setHistLoadingMore(false)
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
    lastPricingDbRef.current = {
      price: Number(row.price),
      cost_purchase: row.cost_purchase ?? null,
      cost_manufacturing: row.cost_manufacturing ?? null,
      cost_packaging: row.cost_packaging ?? null,
      margin: row.margin ?? null,
    }
    setImageUrl(productPhotoPublicUrl(supabase, row.image_path))
    const { data: ph, error: phErr } = await supabase
      .from('product_price_history')
      .select('*')
      .eq('product_id', productId)
      .order('valid_from', { ascending: false })
      .range(0, HIST_PAGE - 1)
    setHistError(phErr?.message ?? null)
    const hRows = (ph as ProductPriceHistoryRow[]) ?? []
    setHist(hRows)
    setHistHasMore(!phErr && hRows.length === HIST_PAGE)
    const { data: pg } = await supabase
      .from('product_packaging')
      .select(PACKAGING_SELECT)
      .eq('product_id', productId)
      .is('archived_at', null)
    setPacks((pg as PackagingLine[]) ?? [])
    setLoading(false)
  }, [supabase, productId])

  const loadMoreHistory = useCallback(async () => {
    if (!productId || histLoadingMore) return
    setHistLoadingMore(true)
    setHistError(null)
    const from = hist.length
    const { data: ph, error: phErr } = await supabase
      .from('product_price_history')
      .select('*')
      .eq('product_id', productId)
      .order('valid_from', { ascending: false })
      .range(from, from + HIST_PAGE - 1)
    if (phErr) {
      setHistError(phErr.message)
      setHistLoadingMore(false)
      return
    }
    const next = (ph as ProductPriceHistoryRow[]) ?? []
    setHist(prev => [...prev, ...next])
    setHistHasMore(next.length === HIST_PAGE)
    setHistLoadingMore(false)
  }, [supabase, productId, hist.length, histLoadingMore])

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
    if (readOnly) return
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

  const openRetroMarginDialog = () => {
    if (readOnly || !productId) return
    setRetroErr(null)
    setRetroDate(HISTORIQUE_FROM_ISO)
    setRetroMargin(p.margin != null ? String(p.margin) : '')
    setRetroDialogOpen(true)
  }

  const saveRetroMargin = async () => {
    if (readOnly || !productId) return
    const marginN = num(retroMargin)
    if (marginN == null) {
      setRetroErr('Indiquez une marge (nombre).')
      return
    }
    if (retroDate < HISTORIQUE_FROM_ISO || retroDate > todayIso) {
      setRetroErr(`Date entre ${HISTORIQUE_FROM_ISO} et aujourd’hui.`)
      return
    }
    const dateTaken = hist.some(
      h => String(h.valid_from).slice(0, 10) === retroDate.slice(0, 10),
    )
    if (dateTaken) {
      setRetroErr('Une ligne existe déjà pour cette date — choisissez une autre date ou modifiez la marge actuelle du produit.')
      return
    }
    setRetroSaving(true)
    setRetroErr(null)
    const snapshot: ProductPricingSnapshot = {
      price: Number(p.price) || 0,
      cost_purchase: p.cost_purchase ?? null,
      cost_manufacturing: p.cost_manufacturing ?? null,
      cost_packaging: p.cost_packaging ?? null,
      margin: marginN,
    }
    const { error: hErr } = await insertProductPriceHistoryRow(supabase, {
      product_id: productId,
      valid_from: retroDate,
      ...snapshot,
    })
    if (hErr) {
      setRetroErr(hErr.message)
      setRetroSaving(false)
      return
    }
    setRetroDialogOpen(false)
    setRetroSaving(false)
    await loadProduct()
  }

  const save = async () => {
    if (readOnly) return
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
      vendeur_id: p.vendeur_id?.trim() ? p.vendeur_id : null,
      name_ar: p.name_ar || null,
      cost_purchase: p.cost_purchase,
      cost_manufacturing: p.cost_manufacturing,
      cost_packaging: p.cost_packaging,
      margin: p.margin,
      image_path: p.image_path ?? null,
      active: p.active ?? true,
      visible_vitrine: p.visible_vitrine ?? true,
      allow_unit_in_commande: p.allow_unit_in_commande ?? true,
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
      const { error: h1 } = await insertProductPriceHistoryRow(supabase, {
        product_id: newId,
        price: Number(p.price) || 0,
        cost_purchase: p.cost_purchase ?? null,
        cost_manufacturing: p.cost_manufacturing ?? null,
        cost_packaging: p.cost_packaging ?? null,
        margin: p.margin ?? null,
      })
      if (h1) {
        setErr(h1.message)
        setSaving(false)
        return
      }
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
    const nextSnapshot: ProductPricingSnapshot = {
      price: Number(p.price) || 0,
      cost_purchase: p.cost_purchase ?? null,
      cost_manufacturing: p.cost_manufacturing ?? null,
      cost_packaging: p.cost_packaging ?? null,
      margin: p.margin ?? null,
    }
    if (pricingSnapshotChanged(lastPricingDbRef.current, nextSnapshot)) {
      const { error: h2 } = await insertProductPriceHistoryRow(supabase, {
        product_id: productId!,
        ...nextSnapshot,
      })
      if (h2) {
        setErr(h2.message)
        setSaving(false)
        return
      }
      lastPricingDbRef.current = nextSnapshot
    }
    await loadProduct()
    setSaving(false)
    if (returnTo) {
      router.push(returnTo)
    }
  }

  const onFile = async (f: File | null) => {
    if (readOnly) return
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

  const openAddPackDialog = () => {
    if (packagingReadOnly) return
    setAddPackDialogErr(null)
    setAddNom('')
    setAddNomAr('')
    setAddQty('1')
    if (conds[0]) setAddCond(conds[0].id)
    if (units[0]) setAddUnit(units[0].id)
    setAddPackDialogOpen(true)
  }

  const addPackaging = async (): Promise<boolean> => {
    if (packagingReadOnly) return false
    if (!productId) {
      setAddPackDialogErr('Enregistrez le produit avant d’ajouter un conditionnement.')
      return false
    }
    const q = num(addQty)
    if (q == null || q <= 0 || !addCond || !addUnit) {
      setAddPackDialogErr('Conditionnement, quantité > 0 et unité requis.')
      return false
    }
    if (hasPackagingCombo(packs, addCond, addUnit)) {
      setAddPackDialogErr(
        'Ce conditionnement avec cette unité de vente existe déjà. Modifiez la ligne existante (Paramètres) ou choisissez une autre unité.',
      )
      return false
    }
    setAddPackDialogErr(null)
    const nomTrim = addNom.trim()
    const nomArTrim = addNomAr.trim()
    const { data: ins, error: e1 } = await supabase
      .from('product_packaging')
      .insert({
        product_id: productId,
        conditionnement_id: addCond,
        quantity: q,
        sales_unit_id: addUnit,
        nom: nomTrim.length > 0 ? nomTrim : null,
        nom_ar: nomArTrim.length > 0 ? nomArTrim : null,
      } as never)
      .select('id')
      .single()
    if (e1) {
      setAddPackDialogErr(packagingDbErrorMessage(e1))
      return false
    }
    const newId = (ins as { id: string } | null)?.id
    const sid = p.supplier_id?.trim()
    if (newId && sid) {
      await supabase.from('product_packaging_supplier').insert({
        product_packaging_id: newId,
        supplier_id: sid,
      } as never)
    }
    setAddNom('')
    setAddNomAr('')
    await reloadPacks()
    return true
  }

  const confirmAddPackaging = async () => {
    setAddPackSaving(true)
    try {
      const ok = await addPackaging()
      if (ok) setAddPackDialogOpen(false)
    } finally {
      setAddPackSaving(false)
    }
  }

  const removePack = async (id: string) => {
    if (packagingReadOnly) return
    setErr(null)
    const { error: e1 } = await supabase
      .from('product_packaging')
      .update(productPackagingArchiveUpdate() as never)
      .eq('id', id)
      .is('archived_at', null)
    if (e1) {
      setErr(e1.message)
      return
    }
    setPacks(prev => prev.filter(x => x.id !== id))
  }

  const openRemovePackDialog = (pack: PackagingLine) => {
    if (packagingReadOnly) return
    setPendingRemovePack(pack)
  }

  const closeRemovePackDialog = () => {
    if (removePackSaving) return
    setPendingRemovePack(null)
  }

  const confirmRemovePack = async () => {
    const pack = pendingRemovePack
    if (!pack || packagingReadOnly) return
    setRemovePackSaving(true)
    setErr(null)
    try {
      await removePack(pack.id)
      setPendingRemovePack(null)
    } finally {
      setRemovePackSaving(false)
    }
  }

  if (loading || permLoading)
    return (
      <div className="p-6">
        <p className="text-slate-600">Chargement…</p>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-col gap-1">
          <BackNavButton href={returnTo ?? '/produits'} size="small">
            {returnTo ? 'Retour au parcours' : 'Liste produits'}
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
            {isNew ? 'Nouveau produit' : p.name?.trim() || (p.code != null ? `Produit ${p.code}` : 'Fiche produit')}
          </Typography>
        </div>
        {err ? (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">{err}</div>
        ) : null}
        {readOnly && !isNew && packagingReadOnly ? (
          <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">
            Lecture seule — vous n&apos;avez pas la permission de modifier ce produit.
          </div>
        ) : null}
        {readOnly && !isNew && canEditPackaging ? (
          <div className="mb-3 rounded border border-sky-200 bg-sky-50 p-2 text-sm text-sky-950">
            Fiche produit en lecture seule — vous pouvez toutefois gérer les conditionnements (ajout, paramètres,
            retrait) pour la commande en cours.
          </div>
        ) : null}

        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0 disabled:opacity-80">
        <div className="flex flex-col gap-3">
          <TextField
            required
            size="small"
            label="Nom"
            value={p.name ?? ''}
            onChange={e => setP(x => ({ ...x, name: e.target.value }))}
            fullWidth
          />
          <TextField
            size="small"
            label="Nom (arabe)"
            value={p.name_ar ?? ''}
            onChange={e => setP(x => ({ ...x, name_ar: e.target.value }))}
            fullWidth
            slotProps={{ input: { dir: 'rtl' } }}
          />
          <TextField
            size="small"
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-3">
            <FormControl size="small" sx={{ minWidth: 0, width: '100%', flex: { sm: '1 1 140px' } }}>
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
            <FormControl size="small" sx={{ minWidth: 0, width: '100%', flex: { sm: '1 1 160px' } }}>
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
          </div>
          <FormControl size="small" fullWidth>
            <InputLabel>Fournisseur</InputLabel>
            <Select
              value={p.supplier_id ?? ''}
              label="Fournisseur"
              onChange={e => {
                const supplier_id = e.target.value
                setP(x => {
                  const vendeurOk =
                    x.vendeur_id &&
                    vendeurs.some(v => v.id === x.vendeur_id && v.supplier_id === supplier_id)
                  return {
                    ...x,
                    supplier_id,
                    vendeur_id: vendeurOk ? x.vendeur_id : null,
                  }
                })
              }}
            >
              {sups.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth disabled={!p.supplier_id?.trim()}>
            <InputLabel>Vendeur</InputLabel>
            <Select
              value={p.vendeur_id ?? ''}
              label="Vendeur"
              onChange={e =>
                setP(x => ({
                  ...x,
                  vendeur_id: e.target.value.length > 0 ? e.target.value : null,
                }))
              }
            >
              <MenuItem value="">
                <em>Aucun</em>
              </MenuItem>
              {vendeursProduit.map(v => (
                <MenuItem key={v.id} value={v.id}>
                  {v.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
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
            size="small"
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
            size="small"
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
              size="small"
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
          <div className="flex flex-wrap gap-3">
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={p.active ?? true}
                  onChange={e => setP(x => ({ ...x, active: e.target.checked }))}
                />
              }
              label="Actif"
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={p.visible_vitrine ?? true}
                  onChange={e => setP(x => ({ ...x, visible_vitrine: e.target.checked }))}
                />
              }
              label="Visible vitrine (futur)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={p.allow_unit_in_commande ?? true}
                  onChange={e => setP(x => ({ ...x, allow_unit_in_commande: e.target.checked }))}
                />
              }
              label="Commande fournisseur : autoriser la saisie à l’unité"
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
            size="small"
            disabled={saving || readOnly}
            onClick={() => void save()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
        </fieldset>

        {!isNew && productId ? (
          <Box sx={{ mt: 4 }} className="m-0 min-w-0 border-0 p-0">
            <Typography variant="h6" sx={{ mb: 1 }}>
              Conditionnements
            </Typography>
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="outlined"
                size="small"
                disabled={packagingReadOnly}
                onClick={openAddPackDialog}
                sx={{ textTransform: 'none' }}
              >
                Ajouter un conditionnement
              </Button>
            </div>
            <table className="w-full text-sm border border-slate-200 rounded">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600">
                  <th className="p-2">Conditionnement</th>
                  <th className="p-2">Qté</th>
                  <th className="p-2">UdV</th>
                  <th className="p-2">Vente</th>
                  <th className="p-2">Achat</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {packs.map(x => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="p-2">
                      {packagingConditionnementLabel({
                        id: x.id,
                        quantity: x.quantity,
                        nom: x.nom,
                        ref_conditionnement: x.ref_conditionnement,
                        ref_sales_unit: x.ref_sales_unit,
                      })}
                    </td>
                    <td className="p-2">{String(x.quantity)}</td>
                    <td className="p-2">{(x.ref_sales_unit as RefRow | null)?.label ?? '—'}</td>
                    <td className="p-2">{x.available_for_sale !== false ? 'Oui' : 'Non'}</td>
                    <td className="p-2">{x.available_for_purchase !== false ? 'Oui' : 'Non'}</td>
                    <td className="p-2">
                      <Button
                        type="button"
                        size="small"
                        variant="outlined"
                        disabled={packagingReadOnly}
                        onClick={() => setPackDialog(x)}
                        sx={{ textTransform: 'none' }}
                      >
                        Paramètres
                      </Button>
                      <Button
                        type="button"
                        size="small"
                        color="error"
                        disabled={packagingReadOnly}
                        onClick={() => openRemovePackDialog(x)}
                        sx={{ textTransform: 'none', ml: 0.5 }}
                      >
                        Archiver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ProductPackagingSettingsDialog
              open={packDialog != null}
              onClose={() => setPackDialog(null)}
              readOnly={packagingReadOnly}
              line={packDialog}
              siblingLines={packDialog ? packs.filter(p => p.id !== packDialog.id) : []}
              magasins={magasins}
              units={units}
              suppliers={sups}
              vendeurs={vendeurs}
              onSaved={() => void reloadPacks()}
            />
            <Dialog
              open={addPackDialogOpen}
              onClose={() => !addPackSaving && setAddPackDialogOpen(false)}
              fullWidth
              maxWidth="xs"
            >
              <DialogTitle sx={{ pb: 0.5 }}>Ajouter un conditionnement</DialogTitle>
              <DialogContent dividers>
                {addPackDialogErr ? (
                  <Typography color="error" variant="body2" className="!mb-2">
                    {addPackDialogErr}
                  </Typography>
                ) : null}
                <div className="flex flex-col gap-3">
                  <FormControl size="small" fullWidth disabled={packagingReadOnly || addPackSaving}>
                    <InputLabel id="add-pack-cond-label">Conditionnement</InputLabel>
                    <Select
                      labelId="add-pack-cond-label"
                      label="Conditionnement"
                      value={addCond}
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
                    label="Nom affiché"
                    value={addNom}
                    onChange={e => setAddNom(e.target.value)}
                    placeholder="Optionnel"
                    disabled={packagingReadOnly || addPackSaving}
                    fullWidth
                    helperText="Prioritaire sur le libellé réf. (commandes, achat…)"
                  />
                  <TextField
                    size="small"
                    label="Nom affiché (arabe)"
                    value={addNomAr}
                    onChange={e => setAddNomAr(e.target.value)}
                    placeholder="Optionnel"
                    disabled={packagingReadOnly || addPackSaving}
                    fullWidth
                    slotProps={{ input: { dir: 'rtl' } }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <TextField
                      size="small"
                      label="Quantité"
                      value={addQty}
                      onChange={e => setAddQty(e.target.value)}
                      disabled={packagingReadOnly || addPackSaving}
                      sx={{ width: 120 }}
                      slotProps={muiSlotPropsDecimalKeypad}
                    />
                    <FormControl size="small" sx={{ minWidth: 140, flex: 1 }} disabled={packagingReadOnly || addPackSaving}>
                      <InputLabel id="add-pack-udv-label">UdV</InputLabel>
                      <Select
                        labelId="add-pack-udv-label"
                        label="UdV"
                        value={addUnit}
                        onChange={e => setAddUnit(e.target.value)}
                      >
                        {units.map(u => (
                          <MenuItem key={u.id} value={u.id}>
                            {u.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </div>
                </div>
              </DialogContent>
              <DialogActions className="!px-3 !pb-2">
                <Button
                  type="button"
                  color="inherit"
                  onClick={() => setAddPackDialogOpen(false)}
                  disabled={addPackSaving}
                  sx={{ textTransform: 'none' }}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  color="success"
                  disabled={packagingReadOnly || addPackSaving}
                  onClick={() => void confirmAddPackaging()}
                  sx={{ textTransform: 'none' }}
                >
                  {addPackSaving ? '…' : 'Ajouter'}
                </Button>
              </DialogActions>
            </Dialog>
            <Dialog open={pendingRemovePack != null} onClose={closeRemovePackDialog} fullWidth maxWidth="sm">
              <DialogTitle sx={{ pb: 0.5 }}>Archiver le conditionnement</DialogTitle>
              <DialogContent>
                {pendingRemovePack ? (
                  <Typography variant="body2" color="text.secondary">
                    Archiver «{' '}
                    {packagingConditionnementLabel({
                      id: pendingRemovePack.id,
                      quantity: pendingRemovePack.quantity,
                      nom: pendingRemovePack.nom,
                      ref_conditionnement: pendingRemovePack.ref_conditionnement,
                      ref_sales_unit: pendingRemovePack.ref_sales_unit,
                    })}{' '}
                    » ? Il ne sera plus proposé à la saisie ni au catalogue, mais restera visible
                    sur les commandes et lots qui l’utilisent déjà.
                  </Typography>
                ) : null}
              </DialogContent>
              <DialogActions className="!px-3 !pb-2">
                <Button
                  type="button"
                  color="inherit"
                  onClick={closeRemovePackDialog}
                  disabled={removePackSaving}
                  sx={{ textTransform: 'none' }}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  color="error"
                  disabled={removePackSaving}
                  onClick={() => void confirmRemovePack()}
                  sx={{ textTransform: 'none' }}
                >
                  {removePackSaving ? '…' : 'Archiver'}
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
        ) : null}

        {!isNew && productId ? (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" sx={{ mb: 1, color: '#0f172a' }}>
              Historique prix et marges
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
              Une ligne est ajoutée à chaque enregistrement qui modifie le prix de vente, un coût ou la marge.
              Pour estimer le bénéfice sur l’historique des ventes, ajoutez une{' '}
              <strong>marge rétroactive</strong> (ex. marge moyenne) à partir du début de la période stats (
              {HISTORIQUE_FROM_ISO}).
            </Typography>
            {!readOnly ? (
              <div className="mb-2">
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={openRetroMarginDialog}
                  sx={{ textTransform: 'none' }}
                >
                  Marge rétroactive (historique stats)
                </Button>
              </div>
            ) : null}
            {histError ? (
              <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                Impossible de charger l’historique : {histError}
              </p>
            ) : null}
            {!histError && hist.length === 0 ? (
              <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                Aucune ligne pour l’instant. Enregistrez un changement tarifaire : il apparaîtra ici.
              </p>
            ) : null}
            {!histError && hist.length > 0 ? (
              <table className="w-full text-sm border border-slate-200 text-slate-900">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-800">
                    <th className="p-2">Date</th>
                    <th className="p-2">Prix vente</th>
                    <th className="p-2">Prix achat</th>
                    <th className="p-2">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.map(h => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className="p-2">
                        {new Date(h.valid_from).toLocaleString('fr-FR', { timeZone: 'UTC' })}
                      </td>
                      <td className="p-2 tabular-nums">
                        {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(h.price)} DH
                      </td>
                      <td className="p-2 tabular-nums">
                        {h.cost_purchase != null
                          ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(h.cost_purchase)} DH`
                          : '—'}
                      </td>
                      <td className="p-2 tabular-nums">
                        {h.margin != null
                          ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(h.margin)} DH`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {!histError && hist.length > 0 && histHasMore ? (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  disabled={histLoadingMore}
                  onClick={() => void loadMoreHistory()}
                  sx={{ textTransform: 'none' }}
                >
                  {histLoadingMore ? 'Chargement…' : 'Voir plus (10 suivantes)'}
                </Button>
              </div>
            ) : null}
            <Dialog open={retroDialogOpen} onClose={() => !retroSaving && setRetroDialogOpen(false)} fullWidth maxWidth="xs">
              <DialogTitle>Marge rétroactive</DialogTitle>
              <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Enregistre une marge en vigueur à partir de la date choisie (pour le calcul bénéfice = qté × marge
                  dans Statistique / Analyse Stats). Les prix et coûts affichés reprennent l’état actuel du produit.
                </Typography>
                {retroErr ? (
                  <Typography variant="body2" color="error">
                    {retroErr}
                  </Typography>
                ) : null}
                <TextField
                  size="small"
                  label="En vigueur à partir du"
                  type="date"
                  value={retroDate}
                  onChange={e => setRetroDate(e.target.value)}
                  slotProps={{
                    htmlInput: { min: HISTORIQUE_FROM_ISO, max: todayIso },
                    inputLabel: { shrink: true },
                  }}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Marge unitaire (DH)"
                  value={retroMargin}
                  onChange={e => setRetroMargin(e.target.value)}
                  slotProps={muiSlotPropsDecimalKeypad}
                  fullWidth
                  required
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRetroDialogOpen(false)} disabled={retroSaving} sx={{ textTransform: 'none' }}>
                  Annuler
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  disabled={retroSaving}
                  onClick={() => void saveRetroMargin()}
                  sx={{ textTransform: 'none' }}
                >
                  {retroSaving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
        ) : null}
      </div>
    </div>
  )
}
