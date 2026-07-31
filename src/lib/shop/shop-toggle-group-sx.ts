import type { SxProps, Theme } from "@mui/material";

/** Boutons choix boutique (retrait / livraison, espèce / carte) — option sélectionnée bien visible. */
export const shopChoiceToggleGroupSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 1,
  "& .MuiToggleButtonGroup-grouped": {
    border: "2px solid !important",
    borderColor: "success.light !important",
    borderRadius: "8px !important",
    textTransform: "none",
    fontWeight: 600,
    fontSize: "0.85rem",
    lineHeight: 1.25,
    py: 1.125,
    color: "text.secondary",
    bgcolor: "background.paper",
    transition: "background-color 0.15s, border-color 0.15s, box-shadow 0.15s",
    "&.Mui-selected": {
      fontWeight: 800,
      color: "common.white",
      bgcolor: "success.main",
      borderColor: "success.dark !important",
      boxShadow: "0 2px 10px rgba(22, 163, 74, 0.4)",
      "&:hover": {
        bgcolor: "success.dark",
      },
    },
    "&:hover:not(.Mui-selected)": {
      bgcolor: "success.50",
      borderColor: "success.main !important",
      color: "success.dark",
    },
  },
};
