"use client";

import { useEffect, useState } from "react";
import { Button, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import FormDialog from "@/lib/mui/FormDialog";

type Props = {
  open: boolean;
  vendorLabel: string;
  initialCommentaire: string;
  busy: boolean;
  onClose: () => void;
  onSave: (commentaire: string) => void;
  labels: {
    title: string;
    field: string;
    save: string;
    cancel: string;
  };
};

export default function AchatVendeurCommentDialog({
  open,
  vendorLabel,
  initialCommentaire,
  busy,
  onClose,
  onSave,
  labels,
}: Props) {
  const [text, setText] = useState(initialCommentaire);

  useEffect(() => {
    if (open) setText(initialCommentaire);
  }, [open, initialCommentaire]);

  return (
    <FormDialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        {labels.title} — {vendorLabel}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          margin="dense"
          label={labels.field}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={busy}
          sx={{ textTransform: "none" }}
        >
          {labels.cancel}
        </Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => onSave(text)}
          sx={{ textTransform: "none" }}
        >
          {labels.save}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
