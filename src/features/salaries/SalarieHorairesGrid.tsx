"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { DAY_LABELS_FR, type HoraireInput, type SalarieHoraireRow } from "@/lib/salaries/types";
import { formatTimeShort } from "@/lib/salaries/planning";

type DayState = {
  day_of_week: number;
  is_repos: boolean;
  heure_debut: string;
  heure_fin: string;
};

function defaultDay(day: number): DayState {
  return { day_of_week: day, is_repos: true, heure_debut: "08:00", heure_fin: "17:00" };
}

function fromRows(rows: SalarieHoraireRow[]): DayState[] {
  const map = new Map<number, DayState>();
  for (let d = 0; d < 7; d++) map.set(d, defaultDay(d));
  for (const r of rows) {
    map.set(r.day_of_week, {
      day_of_week: r.day_of_week,
      is_repos: r.is_repos,
      heure_debut: formatTimeShort(r.heure_debut) || "08:00",
      heure_fin: formatTimeShort(r.heure_fin) || "17:00",
    });
  }
  return Array.from(map.values()).sort((a, b) => a.day_of_week - b.day_of_week);
}

type Props = {
  horaires: SalarieHoraireRow[];
  readOnly?: boolean;
  onChange?: (items: HoraireInput[]) => void;
};

export default function SalarieHorairesGrid({ horaires, readOnly, onChange }: Props) {
  const t = useTranslations("backoffice.salaries.horaires");
  const [days, setDays] = useState<DayState[]>(() => fromRows(horaires));

  useEffect(() => {
    setDays(fromRows(horaires));
  }, [horaires]);

  function emit(next: DayState[]) {
    setDays(next);
    if (!onChange) return;
    const items: HoraireInput[] = next.map((d) =>
      d.is_repos
        ? { day_of_week: d.day_of_week, is_repos: true as const }
        : {
            day_of_week: d.day_of_week,
            is_repos: false as const,
            heure_debut: d.heure_debut.length === 5 ? `${d.heure_debut}:00` : d.heure_debut,
            heure_fin: d.heure_fin.length === 5 ? `${d.heure_fin}:00` : d.heure_fin,
          },
    );
    onChange(items);
  }

  function updateDay(index: number, patch: Partial<DayState>) {
    const next = days.map((d, i) => (i === index ? { ...d, ...patch } : d));
    emit(next);
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("hint")}
      </Typography>
      <Grid container spacing={2}>
        {days.map((d, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={d.day_of_week}>
            <Box
              sx={{
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Typography sx={{ fontWeight: 600, mb: 1 }}>
                {DAY_LABELS_FR[d.day_of_week]}
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={d.is_repos}
                    disabled={readOnly}
                    onChange={(e) => updateDay(index, { is_repos: e.target.checked })}
                  />
                }
                label={t("repos")}
              />
              {!d.is_repos ? (
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <TextField
                    label={t("debut")}
                    type="time"
                    size="small"
                    value={d.heure_debut}
                    disabled={readOnly}
                    onChange={(e) => updateDay(index, { heure_debut: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    label={t("fin")}
                    type="time"
                    size="small"
                    value={d.heure_fin}
                    disabled={readOnly}
                    onChange={(e) => updateDay(index, { heure_fin: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Box>
              ) : null}
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export function horairesToInputs(rows: SalarieHoraireRow[]): HoraireInput[] {
  return fromRows(rows).map((d) =>
    d.is_repos
      ? { day_of_week: d.day_of_week, is_repos: true as const }
      : {
          day_of_week: d.day_of_week,
          is_repos: false as const,
          heure_debut: d.heure_debut.length === 5 ? `${d.heure_debut}:00` : d.heure_debut,
          heure_fin: d.heure_fin.length === 5 ? `${d.heure_fin}:00` : d.heure_fin,
        },
  );
}
