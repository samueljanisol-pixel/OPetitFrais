"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { parseTicketReference } from "@/lib/commandes-client/workflow";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (ticketRef: string) => void;
  title: string;
  hint: string;
  closeLabel: string;
  invalidCode: string;
  cameraDenied: string;
  cameraUnavailable: string;
};

export function isCameraScanSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export default function TicketRefCameraScannerDialog({
  open,
  onClose,
  onDetected,
  title,
  hint,
  closeLabel,
  invalidCode,
  cameraDenied,
  cameraUnavailable,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [starting, setStarting] = useState(false);
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [invalidScan, setInvalidScan] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      return;
    }

    let cancelled = false;
    setStarting(true);
    setCameraErr(null);
    setInvalidScan(false);

    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        const video = videoRef.current;
        if (!video || cancelled) return;

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (cancelled || !result) return;
            const text = result.getText().trim().toUpperCase();
            if (!parseTicketReference(text)) {
              setInvalidScan(true);
              return;
            }
            setInvalidScan(false);
            controls.stop();
            controlsRef.current = null;
            onDetectedRef.current(text);
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        const msg = e instanceof Error ? e.message : String(e);
        if (name === "NotAllowedError" || /permission|not allowed/i.test(msg)) {
          setCameraErr(cameraDenied);
        } else {
          setCameraErr(cameraUnavailable);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, cameraDenied, cameraUnavailable]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {hint}
        </Typography>
        {cameraErr ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {cameraErr}
          </Alert>
        ) : null}
        {invalidScan ? (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setInvalidScan(false)}>
            {invalidCode}
          </Alert>
        ) : null}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            aspectRatio: "4 / 3",
            bgcolor: "grey.900",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {starting ? (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.35)",
              }}
            >
              <CircularProgress color="inherit" />
            </Box>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{closeLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
