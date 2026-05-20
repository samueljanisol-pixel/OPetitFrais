'use client'

import { useEffect, useMemo, useState } from 'react'
import {
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
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import type { RefRow, RefVendeurRow } from '@/lib/products/types'

export type MagasinMini = { id: string; code: string; nom: string }

export type PackagingLineForSettings = {
  id: string
  quantity: number
  sales_unit_id: string
  available_for_sale?: boolean | null
  available_for_purchase?: boolean | null
  product_packaging_magasin?: Array<{ magasin_id: string; sellable: boolean; purchasable: boolean }> | null
  product_packaging_supplier?: Array<{ supplier_id: string }> | null
  product_packaging_vendeur?: Array<{ vendeur_id: string }> | null
}

const parseQty = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

type Props = {
  open: boolean
  onClose: () => void
  readOnly: boolean
  line: PackagingLineForSettings | null
  magasins: MagasinMini[]
  units: RefRow[]
  suppliers: RefRow[]
  vendeurs: RefVendeurRow[]
  /** Fournisseur du produit (création vendeur rapide). */
  productSupplierId?: string | null
  onVendeurCreated?: (row: RefVendeurRow) => void
  onSaved: () => void
}

export function ProductPackagingSettingsDialog({
  open,
  onClose,
  readOnly,
  line,
  magasins,
  units,
  suppliers,
  vendeurs,
  productSupplierId,
  onVendeurCreated,
  onSaved,
}: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [newVendeurLabel, setNewVendeurLabel] = useState('')
  const [creatingVendeur, setCreatingVendeur] = useState(false)

  const [quantity, setQuantity] = useState('1')
  const [salesUnitId, setSalesUnitId] = useState('')
  const [sale, setSale] = useState(true)
  const [purchase, setPurchase] = useState(true)
  const [supplierIds, setSupplierIds] = useState<Set<string>>(new Set())
  const [vendeurIds, setVendeurIds] = useState<Set<string>>(new Set())
  /** magasin_id -> { sell, purch } */
  const [magRows, setMagRows] = useState<Record<string, { sell: boolean; purch: boolean }>>({})

  useEffect(() => {
    if (!open || !line) return
    setErr(null)
    setQuantity(String(line.quantity))
    setSalesUnitId(line.sales_unit_id)
    setSale(line.available_for_sale !== false)
    setPurchase(line.available_for_purchase !== false)
    const s = new Set<string>()
    for (const r of line.product_packaging_supplier ?? []) {
      if (r.supplier_id) s.add(r.supplier_id)
    }
    setSupplierIds(s)
    const m = new Set<string>()
    for (const r of line.product_packaging_vendeur ?? []) {
      if (r.vendeur_id) m.add(r.vendeur_id)
    }
    setVendeurIds(m)

    const byMag: Record<string, { sell: boolean; purch: boolean }> = {}
    const gSell = line.available_for_sale !== false
    const gPurch = line.available_for_purchase !== false
    for (const mag of magasins) {
      const o = (line.product_packaging_magasin ?? []).find(x => x.magasin_id === mag.id)
      byMag[mag.id] = {
        sell: o ? o.sellable : gSell,
        purch: o ? o.purchasable : gPurch,
      }
    }
    setMagRows(byMag)
  }, [open, line, magasins])

  const vendeursEligibles = useMemo(() => {
    if (supplierIds.size === 0) return []
    return vendeurs.filter(v => supplierIds.has(v.supplier_id))
  }, [vendeurs, supplierIds])

  const createVendeurSupplierId = useMemo(() => {
    if (supplierIds.size === 1) return [...supplierIds][0] ?? null
    const pid = productSupplierId?.trim()
    if (pid && supplierIds.has(pid)) return pid
    if (supplierIds.size > 0) return [...supplierIds][0] ?? null
    return pid || null
  }, [supplierIds, productSupplierId])

  const createVendeur = async () => {
    if (readOnly) return
    const label = newVendeurLabel.trim()
    const supplierId = createVendeurSupplierId
    if (!supplierId) {
      setErr('Cochez au moins un fournisseur du colis pour créer un vendeur.')
      return
    }
    if (!label) {
      setErr('Libellé du vendeur requis.')
      return
    }
    setCreatingVendeur(true)
    setErr(null)
    const { data, error: e0 } = await supabase
      .from('ref_supplier_vendeur')
      .insert({ supplier_id: supplierId, label, sort_order: 0 } as never)
      .select('id, supplier_id, label, sort_order')
      .single()
    setCreatingVendeur(false)
    if (e0) {
      setErr(e0.message)
      return
    }
    const row = data as RefVendeurRow
    onVendeurCreated?.(row)
    setVendeurIds(prev => new Set(prev).add(row.id))
    setNewVendeurLabel('')
  }

  const save = async () => {
    if (readOnly || !line) return
    const q = parseQty(quantity)
    if (q == null || q <= 0) {
      setErr('Quantité strictement positive requise.')
      return
    }
    if (!salesUnitId) {
      setErr('Unité de vente requise.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const { error: e1 } = await supabase
        .from('product_packaging')
        .update({
          quantity: q,
          sales_unit_id: salesUnitId,
          available_for_sale: sale,
          available_for_purchase: purchase,
        } as never)
        .eq('id', line.id)
      if (e1) {
        setErr(e1.message)
        setSaving(false)
        return
      }

      const { error: d1 } = await supabase.from('product_packaging_supplier').delete().eq('product_packaging_id', line.id)
      if (d1) {
        setErr(d1.message)
        setSaving(false)
        return
      }
      if (supplierIds.size > 0) {
        const { error: i1 } = await supabase.from('product_packaging_supplier').insert(
          [...supplierIds].map(supplier_id => ({
            product_packaging_id: line.id,
            supplier_id,
          })) as never[],
        )
        if (i1) {
          setErr(i1.message)
          setSaving(false)
          return
        }
      }

      const { error: d2 } = await supabase.from('product_packaging_vendeur').delete().eq('product_packaging_id', line.id)
      if (d2) {
        setErr(d2.message)
        setSaving(false)
        return
      }
      const vendeurIdsToSave = [...vendeurIds].filter(id => vendeursEligibles.some(v => v.id === id))
      if (vendeurIdsToSave.length > 0) {
        const { error: i2 } = await supabase.from('product_packaging_vendeur').insert(
          vendeurIdsToSave.map(vendeur_id => ({
            product_packaging_id: line.id,
            vendeur_id,
          })) as never[],
        )
        if (i2) {
          setErr(i2.message)
          setSaving(false)
          return
        }
      }

      const { error: d3 } = await supabase.from('product_packaging_magasin').delete().eq('product_packaging_id', line.id)
      if (d3) {
        setErr(d3.message)
        setSaving(false)
        return
      }
      const magIns: Array<{
        product_packaging_id: string
        magasin_id: string
        sellable: boolean
        purchasable: boolean
      }> = []
      for (const mag of magasins) {
        const st = magRows[mag.id]
        if (!st) continue
        const sameAsGlobal = st.sell === sale && st.purch === purchase
        if (!sameAsGlobal) {
          magIns.push({
            product_packaging_id: line.id,
            magasin_id: mag.id,
            sellable: st.sell,
            purchasable: st.purch,
          })
        }
      }
      if (magIns.length > 0) {
        const { error: i3 } = await supabase.from('product_packaging_magasin').insert(magIns as never[])
        if (i3) {
          setErr(i3.message)
          setSaving(false)
          return
        }
      }

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const toggleSupplier = (id: string) => {
    setSupplierIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleVendeur = (id: string) => {
    setVendeurIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Paramètres du conditionnement</DialogTitle>
      <DialogContent>
        {err ? <Typography color="error" variant="body2" className="!mb-2">{err}</Typography> : null}
        <div className="mt-1 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <TextField
              size="small"
              label="Quantité"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              disabled={readOnly}
              sx={{ width: 120 }}
              slotProps={muiSlotPropsDecimalKeypad}
              helperText="Poids ou quantité du colis"
            />
            <FormControl size="small" sx={{ minWidth: 180 }} disabled={readOnly}>
              <InputLabel id="pack-settings-udv-label">Unité de vente</InputLabel>
              <Select
                labelId="pack-settings-udv-label"
                label="Unité de vente"
                value={salesUnitId}
                onChange={e => setSalesUnitId(e.target.value as string)}
              >
                {units.map(u => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
          <div className="flex flex-wrap gap-4">
            <FormControlLabel
              control={<Checkbox checked={sale} onChange={e => setSale(e.target.checked)} disabled={readOnly} />}
              label="Disponible pour la vente (réf.)"
            />
            <FormControlLabel
              control={<Checkbox checked={purchase} onChange={e => setPurchase(e.target.checked)} disabled={readOnly} />}
              label="Disponible pour l’achat / commande"
            />
          </div>
          <div>
            <Typography variant="subtitle2" className="!mb-1">Fournisseurs (ligne colis)</Typography>
            <div className="flex max-h-36 flex-col gap-1 overflow-auto rounded border border-slate-200 p-2">
              {suppliers.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Aucun fournisseur en référentiel</Typography>
              ) : (
                suppliers.map(s => (
                  <FormControlLabel
                    key={s.id}
                    control={
                      <Checkbox
                        size="small"
                        checked={supplierIds.has(s.id)}
                        onChange={() => toggleSupplier(s.id)}
                        disabled={readOnly}
                      />
                    }
                    label={s.label}
                  />
                ))
              )}
            </div>
          </div>
          <div>
            <Typography variant="subtitle2" className="!mb-1">Vendeurs</Typography>
            <div className="flex max-h-36 flex-col gap-1 overflow-auto rounded border border-slate-200 p-2">
              {supplierIds.size === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Cochez au moins un fournisseur pour choisir les vendeurs.
                </Typography>
              ) : vendeursEligibles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Aucun vendeur pour ce(s) fournisseur(s) — onglet Vendeurs dans Paramètres.
                </Typography>
              ) : (
                vendeursEligibles.map(v => {
                  const supLabel = suppliers.find(s => s.id === v.supplier_id)?.label
                  return (
                    <FormControlLabel
                      key={v.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={vendeurIds.has(v.id)}
                          onChange={() => toggleVendeur(v.id)}
                          disabled={readOnly}
                        />
                      }
                      label={supLabel ? `${v.label} (${supLabel})` : v.label}
                    />
                  )
                })
              )}
            </div>
            {!readOnly ? (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <TextField
                  size="small"
                  label="Nouveau vendeur"
                  value={newVendeurLabel}
                  onChange={e => setNewVendeurLabel(e.target.value)}
                  disabled={creatingVendeur || !createVendeurSupplierId}
                  sx={{ flex: 1, minWidth: 160 }}
                  helperText={
                    createVendeurSupplierId ? undefined : "Cochez un fournisseur du colis"
                  }
                />
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  disabled={creatingVendeur || !createVendeurSupplierId}
                  onClick={() => void createVendeur()}
                  sx={{ textTransform: "none", flexShrink: 0 }}
                >
                  {creatingVendeur ? "…" : "Créer vendeur"}
                </Button>
              </div>
            ) : null}
          </div>
          <div>
            <Typography variant="subtitle2" className="!mb-1">
              Overrides par magasin (vide = utilise les cases globales ci-dessus)
            </Typography>
            <div className="overflow-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-700">
                    <th className="p-2">Magasin</th>
                    <th className="p-2">Vente</th>
                    <th className="p-2">Achat</th>
                  </tr>
                </thead>
                <tbody>
                  {magasins.map(m => {
                    const st = magRows[m.id] ?? { sell: sale, purch: purchase }
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="p-2">{m.nom} ({m.code})</td>
                        <td className="p-2">
                          <Checkbox
                            size="small"
                            checked={st.sell}
                            disabled={readOnly}
                            onChange={e =>
                              setMagRows(prev => ({
                                ...prev,
                                [m.id]: { ...st, sell: e.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Checkbox
                            size="small"
                            checked={st.purch}
                            disabled={readOnly}
                            onChange={e =>
                              setMagRows(prev => ({
                                ...prev,
                                [m.id]: { ...st, purch: e.target.checked },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
        {!readOnly ? (
          <Button variant="contained" onClick={() => void save()} disabled={saving || !line}>
            {saving ? '…' : 'Enregistrer'}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}
