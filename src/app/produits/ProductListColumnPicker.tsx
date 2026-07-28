'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import FormDialog from '@/lib/mui/FormDialog'
import {
  FIXED_PRODUCT_LIST_COLUMNS,
  PRODUCT_LIST_COLUMN_BY_KEY,
  PRODUCT_LIST_COLUMN_GROUP_LABELS,
  productListColumnsByGroup,
  type ProductListColumnKey,
} from '@/lib/products/product-list-columns'
import {
  defaultProductListColumnPreference,
  normalizeProductListColumnPreference,
  type ProductListColumnPreference,
} from '@/lib/products/product-list-column-preference'

type Props = {
  open: boolean
  preference: ProductListColumnPreference
  onClose: () => void
  onSave: (pref: ProductListColumnPreference) => void
}

function moveKey(list: ProductListColumnKey[], key: ProductListColumnKey, dir: -1 | 1): ProductListColumnKey[] {
  const idx = list.indexOf(key)
  if (idx < 0) return list
  const nextIdx = idx + dir
  if (nextIdx < 0 || nextIdx >= list.length) return list
  const copy = [...list]
  const tmp = copy[idx]!
  copy[idx] = copy[nextIdx]!
  copy[nextIdx] = tmp
  return copy
}

/** Cellule checkbox centrée — largeur fixe pour alignement vertical entre lignes. */
function CheckboxCell({
  checked,
  disabled,
  ariaLabel,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  ariaLabel: string
  onChange: (checked: boolean) => void
}) {
  return (
    <td className="w-14 px-0 py-0.5 text-center align-middle">
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Checkbox
          size="small"
          checked={checked}
          disabled={disabled}
          onChange={(_, v) => onChange(v)}
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          sx={{ p: 0.5 }}
        />
      </Box>
    </td>
  )
}

export default function ProductListColumnPicker({ open, preference, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ProductListColumnPreference>(() =>
    normalizeProductListColumnPreference(preference),
  )

  useEffect(() => {
    if (open) setDraft(normalizeProductListColumnPreference(preference))
  }, [open, preference])

  const visibleSet = useMemo(() => new Set(draft.visible), [draft.visible])
  const editableSet = useMemo(() => new Set(draft.editable), [draft.editable])
  const orderedVisible = useMemo(
    () => draft.order.filter(k => visibleSet.has(k)),
    [draft.order, visibleSet],
  )

  const toggleVisible = (key: ProductListColumnKey, checked: boolean) => {
    setDraft(prev => {
      const nextVisible = new Set(prev.visible)
      if (checked) nextVisible.add(key)
      else nextVisible.delete(key)
      for (const fixed of FIXED_PRODUCT_LIST_COLUMNS) nextVisible.add(fixed)
      const dataVisible = [...nextVisible].filter(k => k !== 'fiche')
      if (dataVisible.length === 0) return prev
      return normalizeProductListColumnPreference({
        visible: [...nextVisible],
        order: prev.order,
        editable: prev.editable,
      })
    })
  }

  const toggleEditable = (key: ProductListColumnKey, checked: boolean) => {
    if (!PRODUCT_LIST_COLUMN_BY_KEY[key].editable) return
    setDraft(prev => {
      const nextEditable = new Set(prev.editable)
      if (checked) nextEditable.add(key)
      else nextEditable.delete(key)
      return normalizeProductListColumnPreference({
        visible: prev.visible,
        order: prev.order,
        editable: [...nextEditable],
      })
    })
  }

  const moveVisible = (key: ProductListColumnKey, dir: -1 | 1) => {
    setDraft(prev => {
      const vis = prev.order.filter(k => prev.visible.includes(k))
      const moved = moveKey(vis, key, dir)
      const rest = prev.order.filter(k => !prev.visible.includes(k))
      return normalizeProductListColumnPreference({
        visible: prev.visible,
        order: [...moved, ...rest],
        editable: prev.editable,
      })
    })
  }

  return (
    <FormDialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Colonnes affichées</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Cochez les colonnes à afficher, indiquez si elles sont modifiables inline, et réordonnez-les. La colonne
          Fiche reste toujours visible.
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                <th className="pb-2 pr-2 font-semibold">Colonne</th>
                <th className="w-14 pb-2 px-0 text-center font-semibold">Afficher</th>
                <th className="w-14 pb-2 px-0 text-center font-semibold">Éditable</th>
                <th className="w-[72px] pb-2 px-0 text-center font-semibold">Ordre</th>
              </tr>
            </thead>
            <tbody>
              {productListColumnsByGroup().map(({ group, columns }) =>
                columns.length === 0 ? null : (
                  <Fragment key={group}>
                    <tr>
                      <td
                        colSpan={4}
                        className="pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-slate-700"
                      >
                        {PRODUCT_LIST_COLUMN_GROUP_LABELS[group]}
                      </td>
                    </tr>
                    {columns.map(col => {
                      const checked = visibleSet.has(col.key)
                      const orderIdx = orderedVisible.indexOf(col.key)
                      const canToggleEditable = col.editable
                      const editableChecked = editableSet.has(col.key)
                      return (
                        <tr key={col.key} className="border-t border-slate-100">
                          <td className="py-1 pr-2 align-middle">
                            <Typography
                              variant="body2"
                              component="span"
                              sx={{ fontWeight: checked ? 600 : 400 }}
                            >
                              {col.label}
                            </Typography>
                          </td>
                          <CheckboxCell
                            checked={checked}
                            ariaLabel={`Afficher ${col.label}`}
                            onChange={v => toggleVisible(col.key, v)}
                          />
                          {canToggleEditable ? (
                            <CheckboxCell
                              checked={editableChecked}
                              disabled={!checked}
                              ariaLabel={`Éditable ${col.label}`}
                              onChange={v => toggleEditable(col.key, v)}
                            />
                          ) : (
                            <td className="w-14 px-0 py-0.5 align-middle" aria-hidden />
                          )}
                          <td className="w-[72px] px-0 py-0.5 text-center align-middle">
                            {checked ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                <IconButton
                                  size="small"
                                  aria-label={`Monter ${col.label}`}
                                  disabled={orderIdx <= 0}
                                  onClick={() => moveVisible(col.key, -1)}
                                >
                                  <ArrowUpwardIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  aria-label={`Descendre ${col.label}`}
                                  disabled={orderIdx < 0 || orderIdx >= orderedVisible.length - 1}
                                  onClick={() => moveVisible(col.key, 1)}
                                >
                                  <ArrowDownwardIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ),
              )}
            </tbody>
          </table>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={() => setDraft(defaultProductListColumnPreference())}
          sx={{ textTransform: 'none', mr: 'auto' }}
        >
          Colonnes par défaut
        </Button>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(normalizeProductListColumnPreference(draft))}
          sx={{ textTransform: 'none' }}
        >
          Enregistrer
        </Button>
      </DialogActions>
    </FormDialog>
  )
}
