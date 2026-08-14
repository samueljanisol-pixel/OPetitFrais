"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import FormDialog from "@/lib/mui/FormDialog";
import { defaultDeliveryDateIso } from "@/lib/commandes-fournisseur/delivery-date";

type DeliveryDateEditBlockProps = {
  displayLabel: string | null;
  savedIso: string | null;
  editable: boolean;
  saving?: boolean;
  /** Valeur proposée à l'ouverture si aucune date enregistrée. */
  emptyDefaultIso?: string;
  onSave: (isoDate: string) => Promise<void>;
};

export default function DeliveryDateEditBlock({
  displayLabel,
  savedIso,
  editable,
  saving = false,
  emptyDefaultIso,
  onSave,
}: DeliveryDateEditBlockProps) {
  const tc = useTranslations("backoffice.commandes.common");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [dialogSaving, setDialogSaving] = useState(false);

  const openDialog = useCallback(() => {
    const initial =
      savedIso && savedIso.length > 0
        ? savedIso
        : emptyDefaultIso && emptyDefaultIso.length > 0
          ? emptyDefaultIso
          : defaultDeliveryDateIso();
    setDraft(initial);
    setDialogOpen(true);
  }, [emptyDefaultIso, savedIso]);

  const closeDialog = useCallback(() => {
    if (!dialogSaving) {
      setDialogOpen(false);
    }
  }, [dialogSaving]);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return;
    }
    setDialogSaving(true);
    try {
      await onSave(trimmed);
      setDialogOpen(false);
    } finally {
      setDialogSaving(false);
    }
  }, [draft, onSave]);

  const busy = saving || dialogSaving;

  return (
    <>
      <Box
        component="section"
        className="!mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3"
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {tc("deliveryDateLabel")}
        </Typography>
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="body2" color="text.secondary">
            {displayLabel ?? tc("deliveryDateNotSet")}
          </Typography>
          {editable ? (
            <Button
              type="button"
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={openDialog}
              sx={{ textTransform: "none", minHeight: 28, py: 0.25 }}
            >
              {tc("editDeliveryDate")}
            </Button>
          ) : null}
        </div>
      </Box>

      <FormDialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 0.5 }}>{tc("deliveryDateLabel")}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            type="date"
            label={tc("deliveryDateLabel")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            margin="dense"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            disabled={busy}
            onClick={closeDialog}
            sx={{ textTransform: "none" }}
          >
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={busy || draft.trim().length === 0}
            onClick={() => void handleSave()}
            sx={{ textTransform: "none" }}
          >
            {busy ? tc("loadingEllipsis") : tc("save")}
          </Button>
        </DialogActions>
      </FormDialog>
    </>
  );
}
