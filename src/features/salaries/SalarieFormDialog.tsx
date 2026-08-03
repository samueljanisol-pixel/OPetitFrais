"use client";

import { useEffect, useState } from "react";
import FormDialog from "@/lib/mui/FormDialog";
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { todayIsoDate } from "@/lib/salaries/planning";

type Props = {
  open: boolean;
  magasinId: string;
  onClose: () => void;
  onSaved: (salarieId: string) => void;
};

export default function SalarieFormDialog({ open, magasinId, onClose, onSaved }: Props) {
  const t = useTranslations("backoffice.salaries.form");
  const tCommon = useTranslations("common");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [dateArrivee, setDateArrivee] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNom("");
    setPrenom("");
    setDateArrivee(todayIsoDate());
    setNotes("");
    setErr(null);
  }, [open]);

  async function handleSave() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          magasin_id: magasinId,
          nom: nom.trim() || null,
          prenom: prenom.trim(),
          date_arrivee: dateArrivee,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string; salarie?: { id: string } };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        return;
      }
      if (json.salarie?.id) {
        onSaved(json.salarie.id);
        onClose();
      }
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
        <TextField
          label={t("nom")}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          fullWidth
          margin="normal"
        />
        <TextField
          label={t("prenom")}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          fullWidth
          margin="normal"
          required
        />
        <TextField
          label={t("dateArrivee")}
          type="date"
          value={dateArrivee}
          onChange={(e) => setDateArrivee(e.target.value)}
          fullWidth
          margin="normal"
          slotProps={{ inputLabel: { shrink: true } }}
          required
        />
        <TextField
          label={t("notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving || !prenom.trim()}
        >
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
