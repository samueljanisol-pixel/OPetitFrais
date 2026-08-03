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
import type { SalariePlanningKind } from "@/lib/salaries/types";

type Props = {
  open: boolean;
  salarieId: string;
  semaine: string;
  dayOfWeek: number;
  onClose: () => void;
  onSaved: () => void;
};

export default function PlanningShiftFormDialog({
  open,
  salarieId,
  semaine,
  dayOfWeek,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("backoffice.salaries.planning.shiftDialog");
  const tCommon = useTranslations("common");
  const [kind, setKind] = useState<SalariePlanningKind>("travail");
  const [heureDebut, setHeureDebut] = useState("08:00");
  const [heureFin, setHeureFin] = useState("17:00");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind("travail");
    setHeureDebut("08:00");
    setHeureFin("17:00");
    setErr(null);
  }, [open, dayOfWeek]);

  async function handleSave() {
    setErr(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        salarie_id: salarieId,
        semaine,
        day_of_week: dayOfWeek,
        kind,
      };
      if (kind === "travail") {
        body.heure_debut = heureDebut;
        body.heure_fin = heureFin;
      }
      const res = await fetch("/api/salaries/planning/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
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
    <FormDialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{t("title")}</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        ) : null}
        <FormControl fullWidth margin="normal">
          <InputLabel id="shift-kind-label">{t("kind")}</InputLabel>
          <Select
            labelId="shift-kind-label"
            label={t("kind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as SalariePlanningKind)}
          >
            <MenuItem value="travail">{t("kindTravail")}</MenuItem>
            <MenuItem value="repos">{t("kindRepos")}</MenuItem>
            <MenuItem value="malade">{t("kindMalade")}</MenuItem>
            <MenuItem value="conge">{t("kindConge")}</MenuItem>
          </Select>
        </FormControl>
        {kind === "travail" ? (
          <BoxTimes
            heureDebut={heureDebut}
            heureFin={heureFin}
            onDebut={setHeureDebut}
            onFin={setHeureFin}
            t={t}
          />
        ) : null}
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

function BoxTimes({
  heureDebut,
  heureFin,
  onDebut,
  onFin,
  t,
}: {
  heureDebut: string;
  heureFin: string;
  onDebut: (v: string) => void;
  onFin: (v: string) => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <TextField
        label={t("debut")}
        type="time"
        value={heureDebut}
        onChange={(e) => onDebut(e.target.value)}
        fullWidth
        margin="normal"
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label={t("fin")}
        type="time"
        value={heureFin}
        onChange={(e) => onFin(e.target.value)}
        fullWidth
        margin="normal"
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </>
  );
}
