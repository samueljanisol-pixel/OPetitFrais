"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FormDialog from "@/lib/mui/FormDialog";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useTranslations } from "next-intl";
import {
  defaultPhotoLabel,
  isSalarieDocumentImage,
  labelFromFileName,
} from "@/lib/salaries/document-helpers";
import type { SalarieDocumentRow } from "@/lib/salaries/types";

type Props = {
  salarieId: string;
  documents: SalarieDocumentRow[];
  canEdit: boolean;
  onChanged: () => void;
};

async function uploadDocument(salarieId: string, file: File, label: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}/documents`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) return json.error ?? "Erreur";
  return null;
}

export default function SalarieDocumentsPanel({ salarieId, documents, canEdit, onChanged }: Props) {
  const t = useTranslations("backoffice.salaries.documents");
  const tCommon = useTranslations("common");

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");

  const photos = documents.filter(isSalarieDocumentImage);
  const files = documents.filter((d) => !isSalarieDocumentImage(d));

  const openConfirmDialog = useCallback((file: File) => {
    setPendingFile(file);
    setLabel(file.type.startsWith("image/") ? labelFromFileName(file.name) : labelFromFileName(file.name));
    setErr(null);
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!dialogOpen) {
      setPendingFile(null);
      setLabel("");
    }
  }, [dialogOpen]);

  async function confirmUpload() {
    if (!pendingFile || !label.trim()) return;
    setBusy(true);
    setErr(null);
    const uploadErr = await uploadDocument(salarieId, pendingFile, label.trim());
    setBusy(false);
    if (uploadErr) {
      setErr(uploadErr);
      return;
    }
    setDialogOpen(false);
    onChanged();
  }

  async function quickPhotoUpload(file: File | null) {
    if (!file || !canEdit) return;
    setBusy(true);
    setErr(null);
    const uploadErr = await uploadDocument(salarieId, file, defaultPhotoLabel());
    setBusy(false);
    if (uploadErr) {
      setErr(uploadErr);
      return;
    }
    onChanged();
  }

  async function deleteDocument(documentId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        return;
      }
      onChanged();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {err ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      ) : null}

      {canEdit ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2, alignItems: "center" }}>
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <PhotoCameraIcon />}
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            {t("camera")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PhotoLibraryIcon />}
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
          >
            {t("gallery")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {t("chooseFile")}
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void quickPhotoUpload(f);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) openConfirmDialog(f);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) openConfirmDialog(f);
              e.target.value = "";
            }}
          />
        </Box>
      ) : null}

      {photos.length > 0 ? (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("photosSection")}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 1.5,
              mb: 2,
            }}
          >
            {photos.map((d) => (
              <Box
                key={d.id}
                sx={{
                  position: "relative",
                  borderRadius: 1,
                  overflow: "hidden",
                  bgcolor: "action.hover",
                  aspectRatio: "1",
                }}
              >
                {d.url ? (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => d.url && setPreviewUrl(d.url)}
                    aria-label={d.label}
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
                      src={d.url}
                      alt={d.label}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </Box>
                ) : null}
                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    px: 0.5,
                    py: 0.25,
                    bgcolor: "rgba(0,0,0,0.55)",
                    color: "common.white",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.label}
                </Typography>
                {canEdit ? (
                  <IconButton
                    size="small"
                    aria-label={tCommon("delete")}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteDocument(d.id);
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
        </>
      ) : null}

      {files.length > 0 ? (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("filesSection")}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 2 }}>
            {files.map((d) => (
              <Box component="li" key={d.id} sx={{ mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" component="span">
                    {d.label}
                  </Typography>
                  {d.url ? (
                    <Button size="small" href={d.url} target="_blank" rel="noopener noreferrer">
                      {t("openDocument")}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <IconButton
                      size="small"
                      aria-label={tCommon("delete")}
                      disabled={busy}
                      onClick={() => void deleteDocument(d.id)}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      ) : null}

      {documents.length === 0 ? (
        <Typography color="text.secondary">{t("empty")}</Typography>
      ) : null}

      <FormDialog
        open={dialogOpen}
        onClose={() => !busy && setDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("uploadTitle")}</DialogTitle>
        <DialogContent>
          {pendingFile ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {pendingFile.name}
            </Typography>
          ) : null}
          <TextField
            label={t("label")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void confirmUpload()}
            disabled={busy || !pendingFile || !label.trim()}
          >
            {busy ? tCommon("saving") : tCommon("save")}
          </Button>
        </DialogActions>
      </FormDialog>

      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {t("previewTitle")}
          <IconButton aria-label={tCommon("close")} onClick={() => setPreviewUrl(null)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: "flex", justifyContent: "center", p: 2 }}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewUrl(null)}>{tCommon("close")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
