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
import { hasPackagingCombo, packagingDbErrorMessage } from '@/lib/products/packaging-errors'

export type MagasinMini = { id: string; code: string; nom: string }

export type PackagingLineForSettings = {
  id: string
  conditionnement_id: string
  quantity: number
  sales_unit_id: string
  nom?: string | null
  nom_ar?: string | null
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
  /** Autres lignes du même produit (détection doublon conditionnement + UdV). */
  siblingLines?: PackagingLineForSettings[]
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
  siblingLines = [],
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
  const [createVendeurDialogOpen, setCreateVendeurDialogOpen] = useState(false)
  const [createVendeurDialogErr, setCreateVendeurDialogErr] = useState<string | null>(null)
  const [createVendeurSupplierPick, setCreateVendeurSupplierPick] = useState('')

  const [quantity, setQuantity] = useState('1')
  const [packNom, setPackNom] = useState('')
  const [packNomAr, setPackNomAr] = useState('')
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
    setPackNom(typeof line.nom === 'string' ? line.nom : '')
    setPackNomAr(typeof line.nom_ar === 'string' ? line.nom_ar : '')
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

  useEffect(() => {
    if (!open) setCreateVendeurDialogOpen(false)
  }, [open])

  const vendeursEligibles = useMemo(() => {
    if (supplierIds.size === 0) return []
    return vendeurs.filter(v => supplierIds.has(v.supplier_id))
  }, [vendeurs, supplierIds])

  const selectedPackSuppliers = useMemo(
    () => suppliers.filter(s => supplierIds.has(s.id)),
    [suppliers, supplierIds],
  )

  const defaultCreateVendeurSupplierId = useMemo(() => {
    if (supplierIds.size === 1) return [...supplierIds][0] ?? null
    const pid = productSupplierId?.trim()
    if (pid && supplierIds.has(pid)) return pid
    if (supplierIds.size > 0) return [...supplierIds][0] ?? null
    return null
  }, [supplierIds, productSupplierId])

  const openCreateVendeurDialog = () => {
    if (supplierIds.size === 0) {
      setErr('Cochez au moins un fournisseur du colis pour créer un vendeur.')
      return
    }
    setCreateVendeurDialogErr(null)
    setNewVendeurLabel('')
    setCreateVendeurSupplierPick(defaultCreateVendeurSupplierId ?? '')
    setCreateVendeurDialogOpen(true)
  }

  const createVendeur = async (): Promise<boolean> => {
    if (readOnly) return false
    const label = newVendeurLabel.trim()
    const supplierId = createVendeurSupplierPick.trim()
    if (!supplierId) {
      setCreateVendeurDialogErr('Choisissez un fournisseur.')
      return false
    }
    if (!label) {
      setCreateVendeurDialogErr('Libellé du vendeur requis.')
      return false
    }
    setCreatingVendeur(true)
    setCreateVendeurDialogErr(null)
    const { data, error: e0 } = await supabase
      .from('ref_supplier_vendeur')
      .insert({ supplier_id: supplierId, label, sort_order: 0 } as never)
      .select('id, supplier_id, label, sort_order')
      .single()
    setCreatingVendeur(false)
    if (e0) {
      setCreateVendeurDialogErr(e0.message)
      return false
    }
    const row = data as RefVendeurRow
    onVendeurCreated?.(row)
    setVendeurIds(prev => new Set(prev).add(row.id))
    setNewVendeurLabel('')
    return true
  }

  const confirmCreateVendeur = async () => {
    const ok = await createVendeur()
    if (ok) setCreateVendeurDialogOpen(false)
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
    if (
      hasPackagingCombo(siblingLines, line.conditionnement_id, salesUnitId, line.id)
    ) {
      setErr(
        'Une autre ligne utilise déjà ce conditionnement avec cette unité de vente. Choisissez une autre unité.',
      )
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const nomTrim = packNom.trim()
      const nomArTrim = packNomAr.trim()
      const { error: e1 } = await supabase
        .from('product_packaging')
        .update({
          quantity: q,
          sales_unit_id: salesUnitId,
          nom: nomTrim.length > 0 ? nomTrim : null,
          nom_ar: nomArTrim.length > 0 ? nomArTrim : null,
          available_for_sale: sale,
          available_for_purchase: purchase,
        } as never)
        .eq('id', line.id)
      if (e1) {
        setErr(packagingDbErrorMessage(e1))
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

  const setGlobalSale = (checked: boolean) => {
    setSale(checked)
    setMagRows(prev => {
      const next = { ...prev }
      for (const mag of magasins) {
        const cur = next[mag.id] ?? { sell: checked, purch: purchase }
        next[mag.id] = { ...cur, sell: checked }
      }
      return next
    })
  }

  const setGlobalPurchase = (checked: boolean) => {
    setPurchase(checked)
    setMagRows(prev => {
      const next = { ...prev }
      for (const mag of magasins) {
        const cur = next[mag.id] ?? { sell: sale, purch: checked }
        next[mag.id] = { ...cur, purch: checked }
      }
      return next
    })
  }

  return (
    <>
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Paramètres du conditionnement</DialogTitle>
      <DialogContent
        sx={{
          pt: 3,
          overflow: 'visible',
          '& .MuiInputLabel-root': {
            bgcolor: 'background.paper',
            px: 0.5,
            lineHeight: 1.4,
          },
        }}
      >
        {err ? <Typography color="error" variant="body2" className="!mb-2">{err}</Typography> : null}
        <div className="flex flex-col gap-3">
          <TextField
            fullWidth
            size="small"
            label="Nom affiché"
            value={packNom}
            onChange={e => setPackNom(e.target.value)}
            disabled={readOnly}
            placeholder="Ex. Cagette rouge"
            helperText="Utilisé partout à la place du libellé du référentiel conditionnement (commandes, achat, export…). Laisser vide pour garder le libellé réf."
          />
          <TextField
            fullWidth
            size="small"
            label="Nom affiché (arabe)"
            value={packNomAr}
            onChange={e => setPackNomAr(e.target.value)}
            disabled={readOnly}
            slotProps={{ input: { dir: 'rtl' } }}
          />
          <div className="flex flex-wrap gap-3">
            <TextField
              size="small"
              label="Quantité"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              disabled={readOnly}
              sx={{ width: 120 }}
              slotProps={muiSlotPropsDecimalKeypad}
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
                  Aucun vendeur
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
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  disabled={supplierIds.size === 0}
                  onClick={openCreateVendeurDialog}
                  sx={{ textTransform: 'none' }}
                >
                  Créer un vendeur
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-4">
            <FormControlLabel
              control={
                <Checkbox
                  checked={sale}
                  onChange={e => setGlobalSale(e.target.checked)}
                  disabled={readOnly}
                />
              }
              label="Disponible pour la vente (réf.)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={purchase}
                  onChange={e => setGlobalPurchase(e.target.checked)}
                  disabled={readOnly}
                />
              }
              label="Disponible pour l’achat / commande"
            />
          </div>
          <div>
            <div className="overflow-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-700">
                    <th className="p-2">Magasin</th>
                    <th className={`p-2 ${!sale ? 'text-slate-400' : ''}`}>Vente</th>
                    <th className={`p-2 ${!purchase ? 'text-slate-400' : ''}`}>Achat</th>
                  </tr>
                </thead>
                <tbody>
                  {magasins.map(m => {
                    const st = magRows[m.id] ?? { sell: sale, purch: purchase }
                    const sellChecked = sale && st.sell
                    const purchChecked = purchase && st.purch
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="p-2">{m.nom} ({m.code})</td>
                        <td className="p-2" style={!sale ? { backgroundColor: 'rgba(0,0,0,0.04)' } : undefined}>
                          <Checkbox
                            size="small"
                            checked={sellChecked}
                            disabled={readOnly || !sale}
                            onChange={e =>
                              setMagRows(prev => ({
                                ...prev,
                                [m.id]: { ...st, sell: e.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td className="p-2" style={!purchase ? { backgroundColor: 'rgba(0,0,0,0.04)' } : undefined}>
                          <Checkbox
                            size="small"
                            checked={purchChecked}
                            disabled={readOnly || !purchase}
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

    <Dialog
      open={createVendeurDialogOpen}
      onClose={() => !creatingVendeur && setCreateVendeurDialogOpen(false)}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle sx={{ pb: 0.5 }}>Créer un vendeur</DialogTitle>
      <DialogContent dividers>
        {createVendeurDialogErr ? (
          <Typography color="error" variant="body2" className="!mb-2">
            {createVendeurDialogErr}
          </Typography>
        ) : null}
        <FormControl
          size="small"
          fullWidth
          disabled={creatingVendeur || selectedPackSuppliers.length <= 1}
          sx={{ mb: 2 }}
        >
          <InputLabel id="create-vendeur-supplier-label">Fournisseur</InputLabel>
          <Select
            labelId="create-vendeur-supplier-label"
            label="Fournisseur"
            value={createVendeurSupplierPick}
            onChange={e => setCreateVendeurSupplierPick(e.target.value as string)}
          >
            {selectedPackSuppliers.map(s => (
              <MenuItem key={s.id} value={s.id}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Libellé du vendeur"
          value={newVendeurLabel}
          onChange={e => setNewVendeurLabel(e.target.value)}
          disabled={creatingVendeur}
          fullWidth
          autoFocus={selectedPackSuppliers.length <= 1}
        />
      </DialogContent>
      <DialogActions className="!px-3 !pb-2">
        <Button
          type="button"
          color="inherit"
          onClick={() => setCreateVendeurDialogOpen(false)}
          disabled={creatingVendeur}
          sx={{ textTransform: 'none' }}
        >
          Annuler
        </Button>
        <Button
          type="button"
          variant="contained"
          color="success"
          disabled={creatingVendeur || !createVendeurSupplierPick.trim()}
          onClick={() => void confirmCreateVendeur()}
          sx={{ textTransform: 'none' }}
        >
          {creatingVendeur ? '…' : 'Créer'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  )
}
