import { useEffect, useState } from "react";
import { Alert, Box, Button, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import FormDialog from "./FormDialog";
import RoundNumpad from "./RoundNumpad";

const ADMIN_PIN = "1145";
const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

export default function AdminPinDialog({ open, onClose, onUnlocked }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setError(null);
  }, [open]);

  const submit = (value: string) => {
    if (value === ADMIN_PIN) {
      setError(null);
      setPin("");
      onUnlocked();
      return;
    }
    setError("Code incorrect");
    setPin("");
  };

  const handleKey = (key: string) => {
    setError(null);
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "OK") {
      submit(pin);
      return;
    }
    if (!/^\d$/.test(key)) return;
    const next = `${pin}${key}`.slice(0, ADMIN_PIN.length);
    setPin(next);
    if (next.length === ADMIN_PIN.length) {
      submit(next);
    }
  };

  return (
    <FormDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Accès paramètres admin</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, pt: 0.5 }}>
        {error ? (
          <Alert severity="error" sx={{ width: "100%" }}>
            {error}
          </Alert>
        ) : null}
        <Typography variant="body2" color="text.secondary" align="center">
          Saisissez le code à chiffres
        </Typography>
        <Typography
          variant="h4"
          sx={{
            letterSpacing: 10,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            minHeight: 48,
            lineHeight: "48px",
          }}
        >
          {"•".repeat(pin.length).padEnd(ADMIN_PIN.length, "○")}
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
          <RoundNumpad keys={PIN_KEYS} onKey={handleKey} keySize={56} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Annuler</Button>
      </DialogActions>
    </FormDialog>
  );
}
