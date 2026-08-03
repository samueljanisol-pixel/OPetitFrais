"use client";

import FormDialog from "@/lib/mui/FormDialog";
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

type PaymentMethod = { id: string; label: string };

type Props = {
  open: boolean;
  clientId: string;
  panierIds: string[];
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

export default function ClientPaiementFormDialog({
  open,
  clientId,
  panierIds,
  montant,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("backoffice.clients.paymentDialog");
  const tCommon = useTranslations("common");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [datePaiement, setDatePaiement] = useState(todayIsoDate());
  const [commentaire, setCommentaire] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    setDatePaiement(todayIsoDate());
    setCommentaire("");
    void loadMethods();
  }, [open, loadMethods]);

  async function save() {
    if (!paymentMethodId || panierIds.length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/clients/paiements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          panierIds,
          paymentMethodId,
          datePaiement,
          commentaire: commentaire.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("summary", { count: panierIds.length, amount: formatDh(montant) })}
        </Typography>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="client-payment-method-label">{t("method")}</InputLabel>
          <Select
            labelId="client-payment-method-label"
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {tCommon("cancel")}
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={saving || panierIds.length === 0}
          onClick={() => void save()}
        >
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
