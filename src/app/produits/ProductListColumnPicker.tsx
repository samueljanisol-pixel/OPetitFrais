'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
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
        <Box
          sx={{
            display: { xs: 'none', sm: 'grid' },
            gridTemplateColumns: '1fr auto auto auto',
            gap: 1,
            px: 0.5,
            pb: 1,
            typography: 'caption',
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
          }}
        >
          <span>Colonne</span>
          <span style={{ width: 72, textAlign: 'center' }}>Afficher</span>
          <span style={{ width: 72, textAlign: 'center' }}>Éditable</span>
          <span style={{ width: 72, textAlign: 'center' }}>Ordre</span>
        </Box>
        {productListColumnsByGroup().map(({ group, columns }) =>
          columns.length === 0 ? null : (
            <Box key={group} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                {PRODUCT_LIST_COLUMN_GROUP_LABELS[group]}
              </Typography>
              <Stack spacing={0.5}>
                {columns.map(col => {
                  const checked = visibleSet.has(col.key)
                  const orderIdx = orderedVisible.indexOf(col.key)
                  const canToggleEditable = col.editable
                  const editableChecked = editableSet.has(col.key)
                  return (
                    <Box
                      key={col.key}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr auto auto auto' },
                        alignItems: 'center',
                        gap: 1,
                        py: 0.25,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: checked ? 600 : 400 }}>
                        {col.label}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'center' } }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={(_, v) => toggleVisible(col.key, v)}
                            />
                          }
                          label={<Box component="span" sx={{ display: { sm: 'none' } }}>Afficher</Box>}
                          sx={{ m: 0 }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'center' } }}>
                        {canToggleEditable ? (
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={editableChecked}
                                disabled={!checked}
                                onChange={(_, v) => toggleEditable(col.key, v)}
                              />
                            }
                            label={<Box component="span" sx={{ display: { sm: 'none' } }}>Éditable</Box>}
                            sx={{ m: 0 }}
                          />
                        ) : (
                          <Box sx={{ width: 42 }} aria-hidden />
                        )}
                      </Box>
                      {checked ? (
                        <Stack direction="row" spacing={0} sx={{ justifyContent: { sm: 'center' } }}>
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
                        </Stack>
                      ) : (
                        <Box sx={{ width: 72 }} aria-hidden />
                      )}
                    </Box>
                  )
                })}
              </Stack>
            </Box>
          ),
        )}
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
