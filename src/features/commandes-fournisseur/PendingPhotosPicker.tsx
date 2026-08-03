"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";

type PendingPhoto = {
  file: File;
  previewUrl: string;
};

type Props = {
  disabled?: boolean;
  labels: {
    title: string;
    empty: string;
    camera: string;
    gallery: string;
    deleteAria: string;
  };
  onChange: (files: File[]) => void;
};

export default function PendingPhotosPicker({ disabled, labels, onChange }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);

  useEffect(() => {
    onChange(pending.map((p) => p.file));
  }, [pending, onChange]);

  useEffect(() => {
    return () => {
      for (const p of pending) {
        URL.revokeObjectURL(p.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke on unmount only
  }, []);

  function addFile(file: File | null) {
    if (!file || disabled) return;
    const previewUrl = URL.createObjectURL(file);
    setPending((prev) => [...prev, { file, previewUrl }]);
  }

  function removeAt(index: number) {
    setPending((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        {labels.title}
      </Typography>
      {pending.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {labels.empty}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
            gap: 1,
            mb: 1.5,
          }}
        >
          {pending.map((ph, index) => (
            <Box
              key={ph.previewUrl}
              sx={{
                position: "relative",
                borderRadius: 1,
                overflow: "hidden",
                bgcolor: "action.hover",
                aspectRatio: "1",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ph.previewUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <IconButton
                size="small"
                aria-label={labels.deleteAria}
                disabled={disabled}
                onClick={() => removeAt(index)}
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  bgcolor: "rgba(0,0,0,0.45)",
                  color: "common.white",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                }}
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          addFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Box className="flex flex-col gap-1.5 sm:flex-row">
        <Button
          type="button"
          variant="outlined"
          fullWidth
          disabled={disabled}
          startIcon={disabled ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
          onClick={() => cameraInputRef.current?.click()}
          sx={{ textTransform: "none", minHeight: 40 }}
        >
          {labels.camera}
        </Button>
        <Button
          type="button"
          variant="outlined"
          fullWidth
          disabled={disabled}
          startIcon={disabled ? <CircularProgress size={18} /> : <PhotoLibraryIcon />}
          onClick={() => galleryInputRef.current?.click()}
          sx={{ textTransform: "none", minHeight: 40 }}
        >
          {labels.gallery}
        </Button>
      </Box>
    </Box>
  );
}
