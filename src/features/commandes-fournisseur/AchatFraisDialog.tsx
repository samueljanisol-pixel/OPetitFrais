"use client";

import { useEffect, useState, type FocusEvent } from "react";
import {
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useTranslations } from "next-intl";
import FormDialog from "@/lib/mui/FormDialog";
import { sanitizeMontantDhTypingFrac2 } from "@/lib/commandes-fournisseur/qty-parse";

export type AchatFraisDialogProps = {
  open: boolean;
  mode: "add" | "edit";
  initialLabel: string;
  initialMontantText: string;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: { label: string; montantText: string }) => void;
};

/**
 * Dialogue isolé : la saisie libellé / montant ne re-rend pas le détail lot entier.
 */
export default function AchatFraisDialog({
  open,
  mode,
  initialLabel,
  initialMontantText,
  busy,
  onClose,
  onSave,
}: AchatFraisDialogProps) {
  const t = useTranslations("backoffice.commandes.achat.detail");
  const tCommon = useTranslations("common");
  const [label, setLabel] = useState(initialLabel);
  const [montantText, setMontantText] = useState(initialMontantText);

  useEffect(() => {
    if (!open) return;
    setLabel(initialLabel);
    setMontantText(initialMontantText);
  }, [open, initialLabel, initialMontantText]);

  return (
    <FormDialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>
        {mode === "edit" ? t("feeDialog.titleEdit") : t("feeDialog.titleAdd")}
      </DialogTitle>
      <DialogContent>
        <TextField
          margin="dense"
          autoFocus
          fullWidth
          label={t("feeDialog.labelField")}
          value={label}
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
        />
        <TextField
          margin="dense"
          fullWidth
          label={t("feeDialog.amountField")}
          value={montantText}
          disabled={busy}
          onChange={(e) => setMontantText(sanitizeMontantDhTypingFrac2(e.target.value))}
          slotProps={{
            htmlInput: {
              inputMode: "decimal",
              onFocus: (ev: FocusEvent<HTMLInputElement>) => {
                const el = ev.target as HTMLInputElement;
                queueMicrotask(() => el.select());
              },
            },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={busy}
          sx={{ textTransform: "none" }}
        >
          {tCommon("cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={busy || label.trim().length === 0}
          onClick={() =>
            onSave({
              label: label.trim(),
              montantText: sanitizeMontantDhTypingFrac2(montantText),
            })
          }
          sx={{ textTransform: "none" }}
        >
          {busy ? <CircularProgress size={18} /> : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
