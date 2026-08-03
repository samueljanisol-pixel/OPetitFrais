"use client";

import { useEffect, useState } from "react";
import { Button, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import FormDialog from "@/lib/mui/FormDialog";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string | null;
  value: string;
  label?: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (value: string) => void;
};

export default function ShopCommentDialog({
  open,
  title,
  subtitle = null,
  value,
  label,
  placeholder,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("shop");
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const handleDelete = () => {
    onSave("");
    onClose();
  };

  const canDelete = value.trim().length > 0;

  return (
    <FormDialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {subtitle}
          </Typography>
        ) : null}
        <TextField
          label={label ?? t("lineCommentLabel")}
          placeholder={placeholder ?? t("lineCommentPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          multiline
          minRows={3}
          maxRows={6}
          fullWidth
          autoFocus
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {canDelete ? (
          <Button onClick={handleDelete} color="error" sx={{ mr: "auto" }}>
            {t("commentDialogDelete")}
          </Button>
        ) : null}
        <Button onClick={onClose}>{t("commentDialogCancel")}</Button>
        <Button onClick={handleSave} variant="contained" color="success">
          {t("commentDialogSave")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
