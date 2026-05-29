'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type ProductSuggestion = {
  id: string
  name: string
  code: string | null
}

type Props = {
  value: string[]
  onChange: (names: string[]) => void
  disabled?: boolean
}

const DEBOUNCE_MS = 300
const MIN_QUERY = 2

function escapeIlikeFragment(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export default function VentesProductChipsFilter({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  const selectedLower = useMemo(() => new Set(value.map((n) => n.trim().toLowerCase())), [value])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY) {
      setSuggestions([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const pat = escapeIlikeFragment(debouncedQuery)
        const { data, error } = await supabase
          .from('product')
          .select('id, name, code')
          .eq('active', true)
          .or(`name.ilike.%${pat}%,code.ilike.%${pat}%`)
          .order('name', { ascending: true })
          .limit(20)

        if (cancelled) return
        if (error) {
          setSuggestions([])
          return
        }

        setSuggestions(
          (data ?? [])
            .map((row) => ({
              id: String(row.id ?? ''),
              name: String(row.name ?? '').trim(),
              code: row.code != null ? String(row.code) : null,
            }))
            .filter((row) => row.id && row.name),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const addProduct = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || selectedLower.has(trimmed.toLowerCase())) return
      onChange([...value, trimmed])
      setQuery('')
      setDebouncedQuery('')
      setSuggestions([])
    },
    [onChange, selectedLower, value],
  )

  const removeProduct = useCallback(
    (name: string) => {
      const key = name.trim().toLowerCase()
      onChange(value.filter((n) => n.trim().toLowerCase() !== key))
    },
    [onChange, value],
  )

  return (
    <Box>
      <TextField
        label="Produits (optionnel)"
        placeholder="Rechercher par nom ou code…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        fullWidth
        size="small"
        helperText={
          value.length === 0
            ? 'Aucune sélection : tous les produits. Saisissez au moins 2 caractères pour chercher.'
            : `${value.length} produit(s) sélectionné(s)`
        }
      />

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            Recherche…
          </Typography>
        </Box>
      ) : null}

      {suggestions.length > 0 ? (
        <List dense disablePadding sx={{ mt: 0.5, maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          {suggestions.map((s) => {
            const already = selectedLower.has(s.name.toLowerCase())
            return (
              <ListItemButton
                key={s.id}
                disabled={already || disabled}
                onClick={() => addProduct(s.name)}
                dense
              >
                <ListItemText
                  primary={s.name}
                  secondary={s.code ? `Code ${s.code}` : undefined}
                />
              </ListItemButton>
            )
          })}
        </List>
      ) : null}

      {value.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
          {value.map((name) => (
            <Chip
              key={name}
              label={name}
              size="small"
              onDelete={disabled ? undefined : () => removeProduct(name)}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
