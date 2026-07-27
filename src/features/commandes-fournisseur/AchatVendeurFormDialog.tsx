"use client";

import {
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { useState } from "react";
import { useTranslations } from "next-intl";
import FormDialog from "@/lib/mui/FormDialog";
import {
  parseDeviseAchat,
  type DeviseAchat,
} from "@/lib/commandes-fournisseur/achat-devise";

export type AchatVendeurFormValues = {
  label: string;
  phone: string;
  preferred_locale: "fr" | "ar-MA";
  devise_achat: DeviseAchat;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  busy: boolean;
  initial: AchatVendeurFormValues;
  onClose: () => void;
  onSave: (values: AchatVendeurFormValues) => void;
};

export default function AchatVendeurFormDialog({
  open,
  mode,
  busy,
  initial,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("backoffice.commandes.achat.detail.vendorForm");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState<AchatVendeurFormValues>(() => ({
    label: initial.label,
    phone: initial.phone,
    preferred_locale: initial.preferred_locale === "ar-MA" ? "ar-MA" : "fr",
    devise_achat: parseDeviseAchat(initial.devise_achat),
  }));

  const labelOk = form.label.trim().length > 0;

  return (
    <FormDialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{mode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
      <DialogContent>
        <div className="mt-1 flex flex-col gap-4">
          <TextField
            margin="dense"
            autoFocus
            fullWidth
            required
            label={t("labelField")}
            value={form.label}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <TextField
            label={t("phoneField")}
            value={form.phone}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            size="small"
            fullWidth
            placeholder={t("phonePlaceholder")}
            helperText={t("phoneHelper")}
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="achat-vendeur-locale-label">{t("localeField")}</InputLabel>
            <Select
              labelId="achat-vendeur-locale-label"
              label={t("localeField")}
              value={form.preferred_locale}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  preferred_locale: e.target.value as "fr" | "ar-MA",
                }))
              }
            >
              <MenuItem value="fr">{t("localeFr")}</MenuItem>
              <MenuItem value="ar-MA">{t("localeAr")}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel id="achat-vendeur-devise-label">{t("currencyField")}</InputLabel>
            <Select
              labelId="achat-vendeur-devise-label"
              label={t("currencyField")}
              value={form.devise_achat}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  devise_achat: parseDeviseAchat(e.target.value),
                }))
              }
            >
              <MenuItem value="dirham">{t("currencyDirham")}</MenuItem>
              <MenuItem value="rial">{t("currencyRial")}</MenuItem>
            </Select>
          </FormControl>
        </div>
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
          disabled={busy || !labelOk}
          onClick={() =>
            onSave({
              label: form.label.trim(),
              phone: form.phone.trim(),
              preferred_locale: form.preferred_locale,
              devise_achat: form.devise_achat,
            })
          }
          sx={{ textTransform: "none" }}
        >
          {busy ? (
            <CircularProgress size={18} />
          ) : mode === "create" ? (
            t("add")
          ) : (
            tCommon("save")
          )}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
