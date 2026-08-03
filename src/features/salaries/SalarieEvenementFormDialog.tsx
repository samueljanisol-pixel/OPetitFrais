"use client";

import { useEffect, useState } from "react";
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
import type { SalarieEvenementKind } from "@/lib/salaries/types";

type Props = {
  open: boolean;
  salarieId: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function SalarieEvenementFormDialog({ open, salarieId, onClose, onSaved }: Props) {
  const t = useTranslations("backoffice.salaries.evenements");
  const tCommon = useTranslations("common");
  const [kind, setKind] = useState<SalarieEvenementKind>("conge");
  const [dateDebut, setDateDebut] = useState(todayIsoDate());
  const [dateFin, setDateFin] = useState(todayIsoDate());
  const [commentaire, setCommentaire] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = todayIsoDate();
    setKind("conge");
    setDateDebut(today);
    setDateFin(today);
    setCommentaire("");
    setErr(null);
  }, [open]);

  async function handleSave() {
    if (dateFin < dateDebut) {
      setErr(t("invalidDates"));
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/salaries/${encodeURIComponent(salarieId)}/evenements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind,
          date_debut: dateDebut,
          date_fin: dateFin,
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
          <InputLabel id="evenement-kind-label">{t("kind")}</InputLabel>
          <Select
            labelId="evenement-kind-label"
            label={t("kind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as SalarieEvenementKind)}
          >
            <MenuItem value="malade">{t("kindMalade")}</MenuItem>
            <MenuItem value="conge">{t("kindConge")}</MenuItem>
            <MenuItem value="autre">{t("kindAutre")}</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label={t("dateDebut")}
          type="date"
          value={dateDebut}
          onChange={(e) => setDateDebut(e.target.value)}
          fullWidth
          margin="normal"
          slotProps={{ inputLabel: { shrink: true } }}
          required
        />
        <TextField
          label={t("dateFin")}
          type="date"
          value={dateFin}
          onChange={(e) => setDateFin(e.target.value)}
          fullWidth
          margin="normal"
          slotProps={{ inputLabel: { shrink: true } }}
          required
        />
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
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
