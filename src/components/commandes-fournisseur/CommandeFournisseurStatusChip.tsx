"use client";

import { Chip, type ChipProps } from "@mui/material";

export type CommandeFournisseurStatusDomain =
  | "commande_fournisseur"
  | "commande_fournisseur_lot";

function chipColorForStatus(
  domain: CommandeFournisseurStatusDomain,
  status: string,
): ChipProps["color"] {
  if (domain === "commande_fournisseur") {
    switch (status) {
      case "en_saisie":
        return "warning";
      case "validee":
        return "info";
      case "integree":
        return "primary";
      case "annulee":
        return "error";
      default:
        return "default";
    }
  }
  switch (status) {
    case "brouillon":
      return "warning";
    case "prete":
      return "success";
    case "achat_en_cours":
      return "info";
    case "terminee":
      return "primary";
    default:
      return "default";
  }
}

type Props = {
  domain: CommandeFournisseurStatusDomain;
  status: string;
  label: string;
  size?: ChipProps["size"];
};

/** Chip de statut commande / lot (saisie, validation, achat). */
export default function CommandeFournisseurStatusChip({
  domain,
  status,
  label,
  size = "small",
}: Props) {
  return (
    <Chip
      label={label}
      color={chipColorForStatus(domain, status)}
      size={size}
      sx={{ fontWeight: 700, flexShrink: 0 }}
    />
  );
}
