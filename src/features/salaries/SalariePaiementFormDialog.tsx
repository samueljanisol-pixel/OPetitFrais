"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "@mui/material";
import { useTranslations } from "next-intl";
import { todayIsoDate } from "@/lib/salaries/planning";
import type { SalariePaiementKind } from "@/lib/salaries/types";
import { muiSlotPropsDecimalKeypad } from "@/lib/mui/numericTextFieldProps";

type PaymentMethod = { id: string; label: string };

type Props = {
  open: boolean;
  salarieId: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function SalariePaiementFormDialog({ open, salarieId, onClose, onSaved }: Props) {
  const t = useTranslations("backoffice.salaries.paiements");
  const tCommon = useTranslations("common");
  const [kind, setKind] = useState<SalariePaiementKind>("salaire");
  const [montant, setMontant] = useState("");
  const [datePaiement, setDatePaiement] = useState(todayIsoDate());
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
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
    setKind("salaire");
    setMontant("");
    setDatePaiement(todayIsoDate());
    setCommentaire("");
    setErr(null);
    void loadMethods();
  }, [open, loadMethods]);

  async function handleSave() {
    const m = Number(montant.replace(",", "."));
    if (!Number.isFinite(m) || m <= 0) {
      setErr(t("invalidAmount"));
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}/paiements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind,
          montant: m,
          date_paiement: datePaiement,
          payment_method_id: paymentMethodId || null,
          commentaire: commentaire.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        return;
      }
      onSaved();
      onClose();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{t("addTitle")}</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        ) : null}
        <FormControl fullWidth margin="normal">
          <InputLabel id="paiement-kind-label">{t("kind")}</InputLabel>
          <Select
            labelId="paiement-kind-label"
            label={t("kind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as SalariePaiementKind)}
          >
            <MenuItem value="salaire">{t("kindSalaire")}</MenuItem>
            <MenuItem value="avance">{t("kindAvance")}</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label={t("montant")}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          fullWidth
          margin="normal"
          required
          slotProps={muiSlotPropsDecimalKeypad}
        />
        <TextField
          label={t("date")}
          type="date"
          value={datePaiement}
          onChange={(e) => setDatePaiement(e.target.value)}
          fullWidth
          margin="normal"
          slotProps={{ inputLabel: { shrink: true } }}
          required
        />
        {methods.length > 0 ? (
          <FormControl fullWidth margin="normal">
            <InputLabel id="payment-method-label">{t("paymentMethod")}</InputLabel>
            <Select
              labelId="payment-method-label"
              label={t("paymentMethod")}
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
            >
              {methods.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        <TextField
          label={t("commentaire")}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          fullWidth
          margin="normal"
          multiline
          minRows={2}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {tCommon("cancel")}
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || !montant}>
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
