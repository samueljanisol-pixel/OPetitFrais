'use client'

import {
  FormControl,
  MenuItem,
  Select,
  Switch,
  TextField,
} from '@mui/material'
import AppLink from '@/components/AppLink'
import ProductPhotoThumb from '@/app/produits/photo/ProductPhotoThumb'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_LIST_COLUMN_BY_KEY,
  productListCellDisplayValue,
  type ProductListColumnKey,
  type ProductListFieldKey,
  type ProductListRefs,
  type ProductListRow,
} from '@/lib/products/product-list-columns'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'

type Props = {
  columnKey: ProductListColumnKey
  row: ProductListRow
  supabase: SupabaseClient
  refs: ProductListRefs
  canWrite: boolean
  disabled?: boolean
  draft?: string
  onDraftChange?: (value: string) => void
  onCommitTextNumber?: () => void
  onCommitSwitch?: (checked: boolean) => void
  onCommitSelect?: (value: string) => void
}

function selectOptionsForField(
  field: ProductListFieldKey,
  row: ProductListRow,
  refs: ProductListRefs,
): Array<{ id: string; label: string }> {
  switch (field) {
    case 'sales_unit_id':
      return refs.salesUnits.map(u => ({ id: u.id, label: u.label }))
    case 'order_unit_id':
    case 'purchase_unit_id':
      return refs[field === 'order_unit_id' ? 'orderUnits' : 'purchaseUnits'].map(u => ({
        id: u.id,
        label: u.label,
      }))
    case 'category_id':
      return refs.categories.map(c => ({ id: c.id, label: c.label }))
    case 'subcategory_id':
      return refs.subcategories
        .filter(sc => sc.category_id === row.category_id)
        .map(sc => ({ id: sc.id, label: sc.label }))
    case 'supplier_id':
      return refs.suppliers.map(s => ({ id: s.id, label: s.label }))
    case 'vendeur_id':
      return refs.vendeurs
        .filter(v => v.supplier_id === row.supplier_id)
        .map(v => ({ id: v.id, label: v.label }))
    case 'shop_favorite_unit_id':
      return refs.shopOrderUnits.map(u => ({ id: u.id, label: u.label }))
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

function nullableSelectField(field: ProductListFieldKey): boolean {
  return (
    field === 'order_unit_id' ||
    field === 'purchase_unit_id' ||
    field === 'subcategory_id' ||
    field === 'vendeur_id' ||
    field === 'emballage_id' ||
    field === 'etiquette_id' ||
    field === 'shop_favorite_unit_id'
  )
}

export default function ProductListCell({
  columnKey,
  row,
  supabase,
  refs,
  canWrite,
  disabled = false,
  draft,
  onDraftChange,
  onCommitTextNumber,
  onCommitSwitch,
  onCommitSelect,
}: Props) {
  const def = PRODUCT_LIST_COLUMN_BY_KEY[columnKey]

  if (def.cellKind === 'fiche') {
    return (
      <AppLink href={`/produits/${row.id}`} className="text-emerald-700 hover:underline text-sm">
        Fiche
      </AppLink>
    )
  }

  if (def.cellKind === 'image') {
    return (
      <ProductPhotoThumb supabase={supabase} imagePath={row.image_path} size={40} className="rounded border border-slate-200" />
    )
  }

  if (def.cellKind === 'readonly') {
    return <span className="font-mono text-slate-800">{row.code}</span>
  }

  if (!canWrite || !def.editable) {
    return <span className="text-slate-900">{productListCellDisplayValue(row, columnKey)}</span>
  }

  if (def.cellKind === 'switch' && def.dbField) {
    const checked = Boolean(row[def.dbField])
    return (
      <Switch
        size="small"
        color="success"
        checked={checked}
        disabled={disabled}
        onChange={(_, v) => onCommitSwitch?.(v)}
        slotProps={{ input: { 'aria-label': `${def.label} — ${row.name}` } }}
      />
    )
  }

  if (def.cellKind === 'select' && def.dbField) {
    const field = columnKey as ProductListFieldKey
    const raw = row[def.dbField]
    const value = raw == null || raw === '' ? '' : String(raw)
    const options = selectOptionsForField(field, row, refs)
    const allowEmpty = nullableSelectField(field)
    return (
      <FormControl size="small" sx={{ minWidth: 120, maxWidth: 200 }} disabled={disabled}>
        <Select
          value={value}
          displayEmpty={allowEmpty}
          onChange={e => onCommitSelect?.(String(e.target.value))}
          sx={{ fontSize: 14, '& .MuiSelect-select': { py: 0.75 } }}
        >
          {allowEmpty ? (
            <MenuItem value="">
              {field === 'shop_favorite_unit_id' ? 'UdV (défaut)' : field === 'vendeur_id' ? 'Aucun' : '—'}
            </MenuItem>
          ) : null}
          {options.map(o => (
            <MenuItem key={o.id} value={o.id}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  if (def.cellKind === 'text' || def.cellKind === 'number') {
    const display =
      draft !== undefined ? draft : productListCellDisplayValue(row, columnKey)
    return (
      <TextField
        size="small"
        type="text"
        value={display}
        disabled={disabled}
        onChange={e => onDraftChange?.(e.target.value)}
        onBlur={() => onCommitTextNumber?.()}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        sx={{
          minWidth: def.cellKind === 'number' ? 90 : 120,
          maxWidth: 200,
          '& .MuiInputBase-input': { fontSize: 14 },
        }}
        slotProps={def.cellKind === 'number' ? muiSlotPropsDecimalKeypad : undefined}
      />
    )
  }

  return <span className="text-slate-900">{productListCellDisplayValue(row, columnKey)}</span>
}
