'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import BackNavButton from '@/components/BackNavButton'
import AppLink from '@/components/AppLink'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { textIncludesFolded } from '@/lib/text/fold-for-search'
import { removeProductBackground } from '@/lib/products/background-removal'
import { productPhotoArchiveFileName, FTP_ARCHIVE_NAME } from '@/lib/products/product-photo-ftp'
import {
  normalizeProductPhotoJpeg,
  revokePreviewUrl,
} from '@/lib/products/photo-normalize'
import {
  readPhotoBgPreference,
  writePhotoBgPreference,
  type PhotoBgPreference,
} from '@/lib/products/photo-bg-preference'
import { productPhotoPublicUrl, removeProductPhoto, uploadProductPhoto } from '@/lib/products/storage'
import { runProductPhotoFtpExport } from '@/lib/products/run-product-photo-ftp-export'

type ProductRow = {
  id: string
  code: string
  name: string
  name_ar: string | null
  image_path: string | null
}

type PreviewState = {
  beforeUrl: string | null
  afterUrl: string
  file: File
}

const checkerboardSx = {
  backgroundImage:
    'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  backgroundColor: '#fff',
}

export default function ProductPhotoCaptureClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const searchParams = useSearchParams()
  const { canWriteProducts, loading: permLoading } = useSessionPermissions()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [products, setProducts] = useState<ProductRow[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bgPref, setBgPref] = useState<PhotoBgPreference>('disabled')
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [showBefore, setShowBefore] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  )

  const selectedImageUrl = useMemo(() => {
    if (!selected?.image_path) return null
    return productPhotoPublicUrl(supabase, selected.image_path)
  }, [selected, supabase])

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return products.slice(0, 80)
    return products
      .filter((p) => {
        return (
          textIncludesFolded(p.name, q) ||
          textIncludesFolded(p.code, q) ||
          (p.name_ar ? textIncludesFolded(p.name_ar, q) : false)
        )
      })
      .slice(0, 80)
  }, [products, search])

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    const { data, error } = await supabase
      .from('product')
      .select('id, code, name, name_ar, image_path')
      .eq('active', true)
      .order('code')
    if (error) {
      setErr(error.message)
      setProducts([])
    } else {
      setProducts((data as ProductRow[]) ?? [])
    }
    setLoadingProducts(false)
  }, [supabase])

  useEffect(() => {
    setBgPref(readPhotoBgPreference())
    void loadProducts()
  }, [loadProducts])

  useEffect(() => {
    const pid = searchParams.get('productId')
    if (pid && products.some((p) => p.id === pid)) {
      setSelectedId(pid)
    }
  }, [searchParams, products])

  const closePreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) {
        revokePreviewUrl(prev.beforeUrl)
        revokePreviewUrl(prev.afterUrl)
      }
      return null
    })
    setShowBefore(false)
  }, [])

  const onBgPrefChange = (enabled: boolean) => {
    const next: PhotoBgPreference = enabled ? 'enabled' : 'disabled'
    setBgPref(next)
    writePhotoBgPreference(next)
  }

  const onPickFile = async (file: File | null) => {
    if (!file || !selected) return
    setErr(null)
    setProcessing(true)
    setProgress(null)
    setStatus(bgPref === 'enabled' ? 'Détourage en cours…' : 'Préparation de l’image…')

    let beforeUrl: string | null = null
    try {
      beforeUrl = URL.createObjectURL(file)
      let working: Blob = file

      if (bgPref === 'enabled') {
        setStatus('Téléchargement du modèle IA…')
        working = await removeProductBackground(file, (p) => {
          if (p.phase === 'model' && typeof p.current === 'number' && typeof p.total === 'number' && p.total > 0) {
            setProgress(Math.round((p.current / p.total) * 100))
            setStatus(`Téléchargement du modèle IA (${p.current}/${p.total})…`)
          } else {
            setStatus('Détourage en cours…')
          }
        })
      }

      const archiveName = productPhotoArchiveFileName(selected.code) ?? `${selected.code}.jpg`
      const { file: jpgFile, previewUrl } = await normalizeProductPhotoJpeg(working, archiveName)
      setPreview({ beforeUrl, afterUrl: previewUrl, file: jpgFile })
      setShowBefore(false)
    } catch (e) {
      if (beforeUrl) revokePreviewUrl(beforeUrl)
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setProcessing(false)
      setProgress(null)
      setStatus(null)
    }
  }

  const onValidatePhoto = async () => {
    if (!preview || !selected) return
    setSaving(true)
    setErr(null)
    try {
      if (selected.image_path) {
        await removeProductPhoto(supabase, selected.image_path)
      }
      const { path, error: upErr } = await uploadProductPhoto(supabase, selected.id, preview.file)
      if (upErr || !path) {
        setErr(upErr ?? 'Upload impossible')
        return
      }
      const { error: dbErr } = await supabase
        .from('product')
        .update({ image_path: path } as never)
        .eq('id', selected.id)
      if (dbErr) {
        setErr(dbErr.message)
        return
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, image_path: path } : p)),
      )
      setStatus(`Photo enregistrée pour ${selected.name}.`)
      closePreview()
    } finally {
      setSaving(false)
    }
  }

  const onExport = async (mode: 'client' | 'server') => {
    setExportOpen(false)
    setExportBusy(true)
    setExportMsg(null)
    try {
      const outcome = await runProductPhotoFtpExport(mode, (p) => setExportMsg(p.message))
      setExportMsg(outcome.message)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setExportBusy(false)
    }
  }

  if (permLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <CircularProgress />
      </div>
    )
  }

  if (!canWriteProducts) {
    return (
      <div className="p-4 md:p-8">
        <Alert severity="warning">Permission produits.write requise.</Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
      <div className="flex items-center gap-2">
        <BackNavButton href="/produits">Produits</BackNavButton>
        <Typography variant="h6" component="h1" sx={{ flex: 1 }}>
          Photos produits
        </Typography>
      </div>

      {err ? <Alert severity="error" onClose={() => setErr(null)}>{err}</Alert> : null}
      {status ? <Alert severity="success" onClose={() => setStatus(null)}>{status}</Alert> : null}

      <TextField
        label="Rechercher un produit"
        size="small"
        fullWidth
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Nom ou code"
      />

      <Box
        sx={{
          maxHeight: 220,
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        {loadingProducts ? (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : filtered.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Aucun produit trouvé.
          </Typography>
        ) : (
          filtered.map((p) => (
            <Button
              key={p.id}
              fullWidth
              onClick={() => setSelectedId(p.id)}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                py: 1.25,
                px: 2,
                borderRadius: 0,
                bgcolor: selectedId === p.id ? 'action.selected' : 'transparent',
              }}
            >
              <span className="font-mono text-xs text-gray-500 mr-2">{p.code}</span>
              <span className="truncate">{p.name}</span>
              {p.image_path ? <span className="ml-auto text-xs text-green-700">photo</span> : null}
            </Button>
          ))
        )}
      </Box>

      {selected ? (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {selected.code} — {selected.name}
          </Typography>
          {selectedImageUrl ? (
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImageUrl}
                alt=""
                width={100}
                height={100}
                className="rounded border object-contain bg-white"
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Aucune photo enregistrée.
            </Typography>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={bgPref === 'enabled'}
                onChange={(e) => onBgPrefChange(e.target.checked)}
              />
            }
            label="Détourage automatique (modèle IA ~40 Mo, une fois par appareil)"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              void onPickFile(f)
              e.target.value = ''
            }}
          />

          <Button
            type="button"
            variant="contained"
            color="primary"
            fullWidth
            startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <PhotoCameraIcon />}
            disabled={processing || saving}
            onClick={() => fileInputRef.current?.click()}
            sx={{ mt: 1, minHeight: 48, textTransform: 'none' }}
          >
            Prendre une photo
          </Button>

          {processing && progress != null ? (
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 1 }} />
          ) : null}
          {processing && status ? (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {status}
            </Typography>
          ) : null}

          <Button
            component={AppLink}
            href={`/produits/${selected.id}`}
            size="small"
            sx={{ mt: 1, textTransform: 'none' }}
          >
            Ouvrir la fiche produit
          </Button>
        </Box>
      ) : (
        <Alert severity="info">Sélectionnez un produit pour photographier.</Alert>
      )}

      <Button
        type="button"
        variant="outlined"
        color="secondary"
        fullWidth
        startIcon={exportBusy ? <CircularProgress size={18} /> : <CloudUploadIcon />}
        disabled={exportBusy || processing}
        onClick={() => {
          setExportMsg(null)
          setExportOpen(true)
        }}
        sx={{ minHeight: 48, textTransform: 'none' }}
      >
        Exporter vers FTP ({FTP_ARCHIVE_NAME})
      </Button>

      {exportMsg ? (
        <Typography variant="body2" color="text.secondary" className="whitespace-pre-wrap">
          {exportMsg}
        </Typography>
      ) : null}

      <Dialog
        open={preview != null}
        onClose={() => !saving && closePreview()}
        fullWidth
        maxWidth="xs"
        fullScreen={false}
      >
        <DialogTitle>Valider la photo (100×100 JPG)</DialogTitle>
        <DialogContent dividers>
          {preview && preview.beforeUrl && bgPref === 'enabled' ? (
            <Button
              size="small"
              onClick={() => setShowBefore((v) => !v)}
              sx={{ mb: 1, textTransform: 'none' }}
            >
              {showBefore ? 'Voir le résultat' : 'Voir l’original'}
            </Button>
          ) : null}
          {preview ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', ...checkerboardSx, p: 2, borderRadius: 1 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={showBefore && preview.beforeUrl ? preview.beforeUrl : preview.afterUrl}
                alt=""
                width={100}
                height={100}
                className="object-contain"
              />
            </Box>
          ) : null}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Format final : JPEG 100×100 px, fond blanc.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
          <Button onClick={closePreview} disabled={saving} sx={{ textTransform: 'none' }}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              closePreview()
              fileInputRef.current?.click()
            }}
            disabled={saving}
            sx={{ textTransform: 'none' }}
          >
            Reprendre
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => void onValidatePhoto()}
            sx={{ textTransform: 'none' }}
          >
            {saving ? <CircularProgress size={18} color="inherit" className="mr-1" /> : null}
            Valider
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={exportOpen} onClose={() => !exportBusy && setExportOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Exporter vers le FTP</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            L’archive <strong>{FTP_ARCHIVE_NAME}</strong> sera créée à partir des photos Supabase (JPG 100×100)
            et déposée dans <code>img_produits/</code> sur le FTP.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, py: 2 }}>
          <Button
            variant="contained"
            disabled={exportBusy}
            onClick={() => void onExport('client')}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Créer le ZIP sur cet appareil (recommandé mobile)
          </Button>
          <Button
            variant="outlined"
            disabled={exportBusy}
            onClick={() => void onExport('server')}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Créer le ZIP sur le serveur
          </Button>
          <Button onClick={() => setExportOpen(false)} disabled={exportBusy} sx={{ textTransform: 'none' }}>
            Annuler
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
