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
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary'
import RotateLeftIcon from '@mui/icons-material/RotateLeft'
import RotateRightIcon from '@mui/icons-material/RotateRight'
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
  readPhotoBgModelReady,
  writePhotoBgPreference,
  type PhotoBgPreference,
} from '@/lib/products/photo-bg-preference'
import { removeProductPhoto, uploadProductPhoto } from '@/lib/products/storage'
import { runProductPhotoFtpExport } from '@/lib/products/run-product-photo-ftp-export'
import ProductPhotoThumb from './ProductPhotoThumb'

type ProductRow = {
  id: string
  code: string
  name: string
  name_ar: string | null
  image_path: string | null
}

type PhotoFilter = 'all' | 'no_photo' | 'with_photo'

type PreviewState = {
  beforeUrl: string | null
  afterUrl: string
  file: File
  workingBlob: Blob
  archiveName: string
  rotationDeg: number
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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [products, setProducts] = useState<ProductRow[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [search, setSearch] = useState('')
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bgPref, setBgPref] = useState<PhotoBgPreference>('disabled')
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [showBefore, setShowBefore] = useState(false)
  const [rotatingPreview, setRotatingPreview] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<number | null>(null)

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  )

  const filtered = useMemo(() => {
    let list = products
    if (photoFilter === 'no_photo') {
      list = list.filter((p) => !p.image_path)
    } else if (photoFilter === 'with_photo') {
      list = list.filter((p) => !!p.image_path)
    }

    const q = search.trim()
    if (q) {
      list = list.filter((p) => {
        return (
          textIncludesFolded(p.name, q) ||
          textIncludesFolded(p.code, q) ||
          (p.name_ar ? textIncludesFolded(p.name_ar, q) : false)
        )
      })
    }

    return list.slice(0, 120)
  }, [products, search, photoFilter])

  const noPhotoCount = useMemo(
    () => products.filter((p) => !p.image_path).length,
    [products],
  )

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
        const modelReady = readPhotoBgModelReady()
        setStatus(modelReady ? 'Détourage en cours…' : 'Téléchargement du modèle IA…')
        working = await removeProductBackground(file, (p) => {
          if (p.downloading && typeof p.current === 'number' && typeof p.total === 'number' && p.total > 0) {
            setProgress(Math.round((p.current / p.total) * 100))
            setStatus(`Téléchargement du modèle IA (${p.current}/${p.total})…`)
          } else {
            setProgress(null)
            setStatus('Détourage en cours…')
          }
        })
      }

      const archiveName = productPhotoArchiveFileName(selected.code) ?? `${selected.code}.jpg`
      const { file: jpgFile, previewUrl } = await normalizeProductPhotoJpeg(working, archiveName, { rotationDeg: 0 })
      setPreview({
        beforeUrl,
        afterUrl: previewUrl,
        file: jpgFile,
        workingBlob: working,
        archiveName,
        rotationDeg: 0,
      })
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

  const rotatePreview = async (delta: -90 | 90) => {
    if (!preview || rotatingPreview || saving) return
    setRotatingPreview(true)
    setErr(null)
    const nextRotation = (preview.rotationDeg + delta + 360) % 360
    try {
      const { file: jpgFile, previewUrl } = await normalizeProductPhotoJpeg(
        preview.workingBlob,
        preview.archiveName,
        { rotationDeg: nextRotation },
      )
      revokePreviewUrl(preview.afterUrl)
      setPreview({
        ...preview,
        afterUrl: previewUrl,
        file: jpgFile,
        rotationDeg: nextRotation,
      })
      setShowBefore(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRotatingPreview(false)
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
    setExportProgress(0)
    try {
      const outcome = await runProductPhotoFtpExport(mode, (p) => {
        setExportMsg(p.message)
        setExportProgress(p.percent)
      })
      setExportMsg(outcome.message)
      if (outcome.ok) setExportProgress(100)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
      setExportProgress(null)
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <TextField
          label="Rechercher un produit"
          size="small"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom ou code"
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="photo-filter-label">Photos</InputLabel>
          <Select
            labelId="photo-filter-label"
            label="Photos"
            value={photoFilter}
            onChange={(e) => setPhotoFilter(e.target.value as PhotoFilter)}
          >
            <MenuItem value="all">Tous</MenuItem>
            <MenuItem value="no_photo">Sans photo ({noPhotoCount})</MenuItem>
            <MenuItem value="with_photo">Avec photo</MenuItem>
          </Select>
        </FormControl>
      </div>

      <Box
        sx={{
          maxHeight: 280,
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
                alignItems: 'center',
                gap: 1.5,
                textTransform: 'none',
                py: 1,
                px: 1.5,
                borderRadius: 0,
                bgcolor: selectedId === p.id ? 'action.selected' : 'transparent',
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <ProductPhotoThumb supabase={supabase} imagePath={p.image_path} size={44} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ fontFamily: 'monospace' }}>
                  {p.code}
                </Typography>
                <Typography variant="body2" noWrap>
                  {p.name}
                </Typography>
              </Box>
            </Button>
          ))
        )}
      </Box>

      {selected ? (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {selected.code} — {selected.name}
          </Typography>
          {selected?.image_path ? (
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
              <Box
                sx={{
                  width: 100,
                  height: 100,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <ProductPhotoThumb supabase={supabase} imagePath={selected.image_path} size={100} />
              </Box>
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
            ref={cameraInputRef}
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
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              void onPickFile(f)
              e.target.value = ''
            }}
          />

          <div className="mt-1 flex flex-col gap-1.5 sm:flex-row">
            <Button
              type="button"
              variant="contained"
              color="primary"
              fullWidth
              startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <PhotoCameraIcon />}
              disabled={processing || saving}
              onClick={() => cameraInputRef.current?.click()}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Prendre une photo
            </Button>
            <Button
              type="button"
              variant="outlined"
              color="primary"
              fullWidth
              startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <PhotoLibraryIcon />}
              disabled={processing || saving}
              onClick={() => galleryInputRef.current?.click()}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Galerie
            </Button>
          </div>

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

      {exportBusy && exportProgress != null ? (
        <Box sx={{ width: '100%' }}>
          <LinearProgress variant="determinate" value={exportProgress} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {exportProgress} %
          </Typography>
        </Box>
      ) : null}

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
            <>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RotateLeftIcon />}
                  disabled={saving || rotatingPreview || showBefore}
                  onClick={() => void rotatePreview(-90)}
                  sx={{ textTransform: 'none', minHeight: 40 }}
                >
                  Pivoter gauche
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RotateRightIcon />}
                  disabled={saving || rotatingPreview || showBefore}
                  onClick={() => void rotatePreview(90)}
                  sx={{ textTransform: 'none', minHeight: 40 }}
                >
                  Pivoter droite
                </Button>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', ...checkerboardSx, p: 2, borderRadius: 1, position: 'relative' }}>
                {rotatingPreview ? (
                  <CircularProgress size={28} sx={{ position: 'absolute', top: '50%', left: '50%', mt: '-14px', ml: '-14px' }} />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={showBefore && preview.beforeUrl ? preview.beforeUrl : preview.afterUrl}
                  alt=""
                  width={100}
                  height={100}
                  className="object-contain"
                  style={{ opacity: rotatingPreview ? 0.4 : 1 }}
                />
              </Box>
            </>
          ) : null}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Format final : JPEG 100×100 px, fond blanc. Utilisez la rotation avant validation.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
          <Button onClick={closePreview} disabled={saving} sx={{ textTransform: 'none' }}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              closePreview()
              cameraInputRef.current?.click()
            }}
            disabled={saving}
            sx={{ textTransform: 'none' }}
          >
            Reprendre
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={saving || rotatingPreview}
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
