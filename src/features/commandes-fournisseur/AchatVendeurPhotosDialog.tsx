"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import FormDialog from "@/lib/mui/FormDialog";
import { isCommandeWhatsAppPhotoPath } from "@/lib/commandes-fournisseur/achat-vendeur-photos";

export type AchatVendeurPhotoItem = {
  id: string;
  storage_path: string;
  url: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  vendorLabel: string;
  photos: AchatVendeurPhotoItem[];
  busy: boolean;
  canEdit: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  onDelete: (photoId: string) => Promise<void>;
  labels: {
    title: string;
    empty: string;
    camera: string;
    gallery: string;
    close: string;
    deleteAria: string;
  };
};

export default function AchatVendeurPhotosDialog({
  open,
  vendorLabel,
  photos,
  busy,
  canEdit,
  onClose,
  onUpload,
  onDelete,
  labels,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const blocked = busy || localBusy;

  useEffect(() => {
    if (!open) setPreviewUrl(null);
  }, [open]);

  async function pick(file: File | null) {
    if (!file || !canEdit) return;
    setLocalBusy(true);
    try {
      await onUpload(file);
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <>
      <FormDialog
        open={open}
        onClose={() => {
          if (!blocked) onClose();
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {labels.title} — {vendorLabel}
        </DialogTitle>
        <DialogContent>
          {photos.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {labels.empty}
            </Typography>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: 1.5,
                mb: 2,
              }}
            >
              {photos.map((ph) => (
                <Box
                  key={ph.id}
                  sx={{
                    position: "relative",
                    borderRadius: 1,
                    overflow: "hidden",
                    bgcolor: "action.hover",
                    aspectRatio: "1",
                  }}
                >
                  {ph.url ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => {
                        if (ph.url) setPreviewUrl(ph.url);
                      }}
                      aria-label={labels.title}
                      sx={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        p: 0,
                        border: 0,
                        cursor: "zoom-in",
                        bgcolor: "transparent",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ph.url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Box>
                  ) : null}
                  {canEdit && !isCommandeWhatsAppPhotoPath(ph.storage_path) ? (
                    <IconButton
                      size="small"
                      aria-label={labels.deleteAria}
                      disabled={blocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        void (async () => {
                          setLocalBusy(true);
                          try {
                            await onDelete(ph.id);
                          } finally {
                            setLocalBusy(false);
                          }
                        })();
                      }}
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        bgcolor: "rgba(0,0,0,0.45)",
                        color: "common.white",
                        "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                      }}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </Box>
              ))}
            </Box>
          )}

          {canEdit ? (
            <>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void pick(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void pick(f);
                  e.target.value = "";
                }}
              />
              <Box className="flex flex-col gap-1.5 sm:flex-row">
                <Button
                  type="button"
                  variant="contained"
                  fullWidth
                  disabled={blocked}
                  startIcon={
                    localBusy ? <CircularProgress size={18} color="inherit" /> : <PhotoCameraIcon />
                  }
                  onClick={() => cameraInputRef.current?.click()}
                  sx={{ textTransform: "none", minHeight: 44 }}
                >
                  {labels.camera}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  disabled={blocked}
                  startIcon={
                    localBusy ? <CircularProgress size={18} color="inherit" /> : <PhotoLibraryIcon />
                  }
                  onClick={() => galleryInputRef.current?.click()}
                  sx={{ textTransform: "none", minHeight: 44 }}
                >
                  {labels.gallery}
                </Button>
              </Box>
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={blocked} sx={{ textTransform: "none" }}>
            {labels.close}
          </Button>
        </DialogActions>
      </FormDialog>

      <Dialog
        open={previewUrl != null}
        onClose={() => setPreviewUrl(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "common.black",
              m: { xs: 1, sm: 2 },
            },
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 240,
          }}
        >
          <IconButton
            aria-label={labels.close}
            onClick={() => setPreviewUrl(null)}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1,
              color: "common.white",
              bgcolor: "rgba(0,0,0,0.4)",
              "&:hover": { bgcolor: "rgba(0,0,0,0.6)" },
            }}
          >
            <CloseIcon />
          </IconButton>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : null}
        </Box>
      </Dialog>
    </>
  );
}
