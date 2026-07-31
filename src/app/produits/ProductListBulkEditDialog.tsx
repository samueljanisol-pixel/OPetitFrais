'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import FormDialog from '@/lib/mui/FormDialog'
import {
  EDITABLE_PRODUCT_LIST_FIELD_KEYS,
  PRODUCT_LIST_COLUMN_BY_KEY,
  type ProductListFieldKey,
  type ProductListRefs,
  type ProductListRow,
} from '@/lib/products/product-list-columns'
import { normalizeFieldValueForCommit } from '@/lib/products/product-field-commit'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'

type Props = {
  open: boolean
  selectedCount: number
  sampleRow: ProductListRow | null
  refs: ProductListRefs
  busy?: boolean
  onClose: () => void
  onApply: (field: ProductListFieldKey, rawValue: unknown) => void
}

function selectOptionsForBulkField(
  field: ProductListFieldKey,
  sampleRow: ProductListRow | null,
  refs: ProductListRefs,
): Array<{ id: string; label: string }> {
  switch (field) {
    case 'sales_unit_id':
      return refs.salesUnits.map(u => ({ id: u.id, label: u.label }))
    case 'order_unit_id':
      return refs.orderUnits.map(u => ({ id: u.id, label: u.label }))
    case 'purchase_unit_id':
      return refs.purchaseUnits.map(u => ({ id: u.id, label: u.label }))
    case 'category_id':
      return refs.categories.map(c => ({ id: c.id, label: c.label }))
    case 'subcategory_id':
      if (!sampleRow) return refs.subcategories.map(sc => ({ id: sc.id, label: sc.label }))
      return refs.subcategories
        .filter(sc => sc.category_id === sampleRow.category_id)
        .map(sc => ({ id: sc.id, label: sc.label }))
    case 'supplier_id':
      return refs.suppliers.map(s => ({ id: s.id, label: s.label }))
    case 'vendeur_id':
      if (!sampleRow) return refs.vendeurs.map(v => ({ id: v.id, label: v.label }))
      return refs.vendeurs
        .filter(v => v.supplier_id === sampleRow.supplier_id)
        .map(v => ({ id: v.id, label: v.label }))
    case 'shop_favorite_unit_id':
      if (!sampleRow) return refs.shopOrderUnits.map(u => ({ id: u.id, label: u.label }))
      return refs.shopOrderUnits
        .filter(u => (sampleRow.shop_order_unit_ids ?? []).includes(u.id))
        .map(u => ({ id: u.id, label: u.label }))
    case 'emballage_id':
      return refs.emballages.map(e => ({
        id: e.id,
        label: e.ref_emballage_type?.label ? `${e.label} (${e.ref_emballage_type.label})` : e.label,
      }))
    case 'etiquette_id':
      return refs.etiquettes.map(e => ({
        id: e.id,
        label: e.reference ? `${e.label} (${e.reference})` : e.label,
      }))
    default:
      return []
  }
}

function nullableBulkField(field: ProductListFieldKey): boolean {
  return (
    field === 'order_unit_id' ||
    field === 'purchase_unit_id' ||
    field === 'subcategory_id' ||
    field === 'vendeur_id' ||
    field === 'emballage_id' ||
    field === 'etiquette_id' ||
    field === 'shop_favorite_unit_id' ||
    field === 'name_ar' ||
    field === 'sales_name' ||
    field === 'sales_name_ar' ||
    field === 'cost_purchase' ||
    field === 'cost_manufacturing' ||
    field === 'cost_packaging' ||
    field === 'margin' ||
    field === 'piece_weight_kg'
  )
}

export default function ProductListBulkEditDialog({
  open,
  selectedCount,
  sampleRow,
  refs,
  busy = false,
  onClose,
  onApply,
}: Props) {
  const [field, setField] = useState<ProductListFieldKey>('active')
  const [textValue, setTextValue] = useState('')
  const [selectValue, setSelectValue] = useState('')
  const [switchValue, setSwitchValue] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setField('active')
    setTextValue('')
    setSelectValue('')
    setSwitchValue(true)
    setLocalError(null)
  }, [open])

  const def = PRODUCT_LIST_COLUMN_BY_KEY[field]
  const fieldOptions = useMemo(
    () =>
      EDITABLE_PRODUCT_LIST_FIELD_KEYS.map(key => ({
        key,
        label: PRODUCT_LIST_COLUMN_BY_KEY[key].label,
      })),
    [],
  )

  const handleApply = () => {
    let raw: unknown
    if (def.cellKind === 'switch') raw = switchValue
    else if (def.cellKind === 'select') raw = selectValue
    else raw = textValue
    const normalized = normalizeFieldValueForCommit(field, raw)
    if (normalized.error) {
      setLocalError(normalized.error)
      return
    }
    setLocalError(null)
    onApply(field, raw)
  }

  const selectOptions = selectOptionsForBulkField(field, sampleRow, refs)

  return (
    <FormDialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>Modifier la sélection</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Appliquer une même valeur à {selectedCount} produit{selectedCount > 1 ? 's' : ''} sélectionné
          {selectedCount > 1 ? 's' : ''}.
        </Typography>
        {localError ? (
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            {localError}
          </Typography>
        ) : null}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel id="bulk-field-label">Champ</InputLabel>
          <Select
            labelId="bulk-field-label"
            label="Champ"
            value={field}
            onChange={e => {
              const next = e.target.value as ProductListFieldKey
              setField(next)
              setTextValue('')
              setSelectValue('')
              setSwitchValue(true)
            }}
          >
            {fieldOptions.map(o => (
              <MenuItem key={o.key} value={o.key}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {def.cellKind === 'switch' ? (
          <FormControl fullWidth>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Nouvelle valeur
            </Typography>
            <Switch
              checked={switchValue}
              onChange={(_, v) => setSwitchValue(v)}
              color="success"
            />
          </FormControl>
        ) : null}

        {def.cellKind === 'select' ? (
          <FormControl fullWidth size="small">
            <InputLabel id="bulk-select-label">Valeur</InputLabel>
            <Select
              labelId="bulk-select-label"
              label="Valeur"
              value={selectValue}
              displayEmpty={nullableBulkField(field)}
              onChange={e => setSelectValue(String(e.target.value))}
            >
              {nullableBulkField(field) ? (
                <MenuItem value="">
                  {field === 'shop_favorite_unit_id' ? 'UdV (défaut)' : field === 'vendeur_id' ? 'Aucun' : '—'}
                </MenuItem>
              ) : null}
              {selectOptions.map(o => (
                <MenuItem key={o.id} value={o.id}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {def.cellKind === 'text' || def.cellKind === 'number' ? (
          <TextField
            fullWidth
            size="small"
            label="Valeur"
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            slotProps={def.cellKind === 'number' ? muiSlotPropsDecimalKeypad : undefined}
          />
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>
          Annuler
        </Button>
        <Button variant="contained" disabled={busy} onClick={handleApply} sx={{ textTransform: 'none' }}>
          {busy ? 'Application…' : `Appliquer à ${selectedCount} produit${selectedCount > 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </FormDialog>
  )
}
