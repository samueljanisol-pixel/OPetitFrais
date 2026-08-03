"use client";

import FormDialog from "@/lib/mui/FormDialog";
import PendingPhotosPicker from "@/features/commandes-fournisseur/PendingPhotosPicker";
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompteAccountType } from "@/lib/commandes-fournisseur/compte-queries";

type PaymentMethod = { id: string; label: string };

type Props = {
  open: boolean;
  accountType: CompteAccountType;
  accountId: string;
  achatIds: string[];
  montant: number;
  onClose: () => void;
  onSaved: () => void;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function uploadPaiementPhotos(paiementId: string, files: File[]): Promise<boolean> {
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `/api/commandes-fournisseur/comptes/paiements/${encodeURIComponent(paiementId)}/photos`,
      { method: "POST", body: form },
    );
    if (!res.ok) return false;
  }
  return true;
}

export default function ComptePaiementFormDialog({
  open,
  accountType,
  accountId,
  achatIds,
  montant,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("backoffice.commandes.comptes.paymentDialog");
  const tCommon = useTranslations("common");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [datePaiement, setDatePaiement] = useState(todayIsoDate());
  const [commentaire, setCommentaire] = useState("");
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePendingPhotosChange = useCallback((files: File[]) => {
    setPendingPhotoFiles(files);
  }, []);

  const loadMethods = useCallback(async () => {
    const res = await fetch("/api/ref/payment-methods");
    const json = (await res.json()) as { methods?: PaymentMethod[] };
    const list = json.methods ?? [];
    setMethods(list);
    if (list.length > 0) {
      setPaymentMethodId((prev) => (prev.length > 0 ? prev : list[0]!.id));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setWarn(null);
    setDatePaiement(todayIsoDate());
    setCommentaire("");
    setPendingPhotoFiles([]);
    setPickerKey((k) => k + 1);
    void loadMethods();
  }, [open, loadMethods]);

  async function save() {
    if (!paymentMethodId || achatIds.length === 0) return;
    setSaving(true);
    setErr(null);
    setWarn(null);
    try {
      const res = await fetch("/api/commandes-fournisseur/comptes/paiements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          accountId,
          achatIds,
          paymentMethodId,
          datePaiement,
          commentaire: commentaire.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string; paiementId?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }

      const paiementId = typeof json.paiementId === "string" ? json.paiementId : "";
      if (paiementId && pendingPhotoFiles.length > 0) {
        const photosOk = await uploadPaiementPhotos(paiementId, pendingPhotoFiles);
        if (!photosOk) {
          setWarn(t("photosUploadFailed"));
          onSaved();
          return;
        }
      }

      onSaved();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{t("title")}</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        ) : null}
        {warn ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {warn}
          </Alert>
        ) : null}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("summary", { count: achatIds.length, amount: formatDh(montant) })}
        </Typography>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="payment-method-label">{t("method")}</InputLabel>
          <Select
            labelId="payment-method-label"
            label={t("method")}
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(String(e.target.value))}
          >
            {methods.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          fullWidth
          type="date"
          label={t("date")}
          value={datePaiement}
          onChange={(e) => setDatePaiement(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label={t("comment")}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
        />
        <PendingPhotosPicker
          key={pickerKey}
          disabled={saving}
          labels={{
            title: t("photosTitle"),
            empty: t("photosEmpty"),
            camera: t("photoCamera"),
            gallery: t("photoGallery"),
            deleteAria: t("photoDeleteAria"),
          }}
          onChange={handlePendingPhotosChange}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {tCommon("cancel")}
        </Button>
        <Button variant="contained" color="success" disabled={saving || achatIds.length === 0} onClick={() => void save()}>
          {saving ? tCommon("loading") : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
