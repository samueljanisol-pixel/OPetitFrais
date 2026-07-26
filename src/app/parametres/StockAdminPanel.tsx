'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Box, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'

type BalanceRow = {
  magasin_id: string
  product_id: string
  quantity: number
  updated_at: string
  product: { code: string; name: string } | { code: string; name: string }[] | null
}

export default function StockAdminPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [magasins, setMagasins] = useState<Array<{ id: string; code: string; nom: string }>>([])
  const [products, setProducts] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [magasinId, setMagasinId] = useState('')
  const [productId, setProductId] = useState('')
  const [delta, setDelta] = useState('0')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<BalanceRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadRefs = useCallback(async () => {
    const [m, p] = await Promise.all([
      supabase.from('magasins').select('id, code, nom').order('sort_order'),
      supabase.from('product').select('id, code, name').eq('active', true).order('name').limit(500),
    ])
    if (m.data) {
      setMagasins(m.data as Array<{ id: string; code: string; nom: string }>)
      setMagasinId(prev => prev || (m.data![0] as { id: string }).id)
    }
    if (p.data) setProducts(p.data as Array<{ id: string; code: string; name: string }>)
  }, [supabase])

  const loadBalances = useCallback(async () => {
    if (!magasinId) {
      setRows([])
      return
    }
    setErr(null)
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_balance')
      .select('magasin_id, product_id, quantity, updated_at, product(code, name)')
      .eq('magasin_id', magasinId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) setErr(error.message)
    setRows((data as BalanceRow[]) ?? [])
    setLoading(false)
  }, [supabase, magasinId])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void loadBalances()
  }, [loadBalances])

  const submitMouvement = async () => {
    if (!magasinId || !productId) {
      setErr('Magasin et produit requis.')
      return
    }
    const d = Number(delta.replace(',', '.'))
    if (!Number.isFinite(d) || d === 0) {
      setErr('Variation non nulle requise.')
      return
    }
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('stock_mouvement').insert({
      magasin_id: magasinId,
      product_id: productId,
      quantity_delta: d,
      note: note.trim() || null,
    } as never)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    setDelta('0')
    setNote('')
    void loadBalances()
  }

  const productLabel = (raw: BalanceRow['product']) => {
    const o = (Array.isArray(raw) ? raw[0] : raw) as { code?: string; name?: string } | null
    if (!o) return '—'
    return `${o.code ?? ''} — ${o.name ?? ''}`.trim()
  }

  return (
    <Box className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
      <Typography variant="subtitle1" className="!mb-2 !font-semibold !text-slate-900">
        Stock par magasin
      </Typography>
      <Typography variant="body2" className="!mb-3 !text-slate-600">
        Les mouvements mettent à jour le solde. Unité : quantités catalogue produit (réf. UdV du produit).
      </Typography>
      {err ? <div className="mb-2 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{err}</div> : null}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Magasin</InputLabel>
          <Select
            label="Magasin"
            value={magasinId}
            onChange={e => setMagasinId(e.target.value)}
          >
            {magasins.map(m => (
              <MenuItem key={m.id} value={m.id}>
                {m.nom} ({m.code})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Produit</InputLabel>
          <Select
            label="Produit"
            value={productId}
            onChange={e => setProductId(e.target.value)}
          >
            <MenuItem value="">
              <em>Choisir…</em>
            </MenuItem>
            {products.map(pr => (
              <MenuItem key={pr.id} value={pr.id}>
                {pr.code} — {pr.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Variation (+ ou −)"
          value={delta}
          onChange={e => setDelta(e.target.value)}
          sx={{ width: 140 }}
          slotProps={muiSlotPropsDecimalKeypad}
        />
        <TextField
          size="small"
          label="Note (optionnel)"
          value={note}
          onChange={e => setNote(e.target.value)}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <Button
          type="button"
          variant="contained"
          color="success"
          disabled={saving}
          onClick={() => void submitMouvement()}
          sx={{ textTransform: 'none' }}
        >
          Enregistrer mouvement
        </Button>
      </div>
      {loading ? (
        <Typography variant="body2" color="text.secondary">Chargement…</Typography>
      ) : (
        <div className="overflow-auto rounded border border-slate-200">
          <table className="w-full text-sm text-slate-900">
            <thead>
              <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-800">
                <th className="p-2">Produit</th>
                <th className="p-2">Solde</th>
                <th className="p-2">Maj</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-slate-600">
                    Aucune ligne de stock pour ce magasin. Créez un mouvement pour initialiser.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={`${r.magasin_id}-${r.product_id}`} className="border-t border-slate-100">
                    <td className="p-2">{productLabel(r.product)}</td>
                    <td className="p-2 tabular-nums">{String(r.quantity)}</td>
                    <td className="p-2 text-xs text-slate-600">
                      {new Date(r.updated_at).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  )
}
