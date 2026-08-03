"use client";

import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { DAY_LABELS_FR, type PlanningSalarieRow, type SalariePlanningKind } from "@/lib/salaries/types";
import { formatTimeShort } from "@/lib/salaries/planning";

type Props = {
  salaries: PlanningSalarieRow[];
  readOnly?: boolean;
  focusSalarieId?: string | null;
  onCellClick?: (salarieId: string, dayOfWeek: number) => void;
};

function kindColor(kind: SalariePlanningKind): "default" | "success" | "warning" | "error" | "info" {
  switch (kind) {
    case "travail":
      return "success";
    case "repos":
      return "default";
    case "malade":
      return "error";
    case "conge":
      return "info";
    default:
      return "default";
  }
}

function cellLabel(
  row: PlanningSalarieRow,
  dayOfWeek: number,
  t: (key: string) => string,
): { text: string; kind: SalariePlanningKind | "horaire" | "empty" } {
  const shift = row.shifts.find((s) => s.day_of_week === dayOfWeek);
  if (shift) {
    if (shift.kind === "travail") {
      const deb = formatTimeShort(shift.heure_debut);
      const fin = formatTimeShort(shift.heure_fin);
      return { text: `${deb}–${fin}`, kind: shift.kind };
    }
    return { text: t(`kind.${shift.kind}`), kind: shift.kind };
  }
  const horaire = row.horaires.find((h) => h.day_of_week === dayOfWeek);
  if (horaire) {
    if (horaire.is_repos) return { text: t("kind.repos"), kind: "repos" };
    const deb = formatTimeShort(horaire.heure_debut);
    const fin = formatTimeShort(horaire.heure_fin);
    return { text: `${deb}–${fin}`, kind: "horaire" };
  }
  return { text: "—", kind: "empty" };
}

export default function PlanningWeekGrid({
  salaries,
  readOnly,
  focusSalarieId,
  onCellClick,
}: Props) {
  const t = useTranslations("backoffice.salaries.planning");

  const rows = focusSalarieId
    ? salaries.filter((s) => s.id === focusSalarieId)
    : salaries;

  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        {t("empty")}
      </Typography>
    );
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("columnEmployee")}</TableCell>
            {DAY_LABELS_FR.map((label) => (
              <TableCell key={label} align="center">
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {row.prenom}
                  {row.nom ? ` ${row.nom}` : ""}
                </Typography>
              </TableCell>
              {DAY_LABELS_FR.map((_, dayOfWeek) => {
                const cell = cellLabel(row, dayOfWeek, t);
                const clickable = !readOnly && onCellClick;
                return (
                  <TableCell
                    key={dayOfWeek}
                    align="center"
                    onClick={clickable ? () => onCellClick(row.id, dayOfWeek) : undefined}
                    sx={{
                      cursor: clickable ? "pointer" : "default",
                      "&:hover": clickable ? { bgcolor: "action.hover" } : undefined,
                    }}
                  >
                    {cell.kind === "empty" ? (
                      cell.text
                    ) : (
                      <Chip
                        size="small"
                        label={cell.text}
                        color={cell.kind === "horaire" ? "default" : kindColor(cell.kind as SalariePlanningKind)}
                        variant={cell.kind === "horaire" ? "outlined" : "filled"}
                      />
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
