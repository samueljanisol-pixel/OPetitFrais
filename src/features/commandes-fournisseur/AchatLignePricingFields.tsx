"use client";

import { memo, useEffect, useMemo, useState, type FocusEvent } from "react";
import { TableCell, TextField, Typography } from "@mui/material";
import { DecimalQtyTextField } from "@/components/commandes-fournisseur/DecimalQtyTextField";
import {
  type DeviseAchat,
  dhTextToDisplayText,
  displayTextToDhText,
  parseMontantText,
  rialToDh,
} from "@/lib/commandes-fournisseur/achat-devise";
import { sanitizeMontantDhTypingFrac2 } from "@/lib/commandes-fournisseur/qty-parse";

export type AchatPricingCommit = {
  qte_achat?: number;
  /** Toujours en DH (stockage). */
  puText?: string;
  /** Toujours en DH (stockage). */
  totalText?: string;
};

export type AchatPricingChanged = "qte" | "pu" | "total";

type Props = {
  lineId: string;
  qte: number;
  /** PU en DH (état parent). */
  puText: string;
  /** Total en DH (état parent). */
  totalText: string;
  editable: boolean;
  /** Libellé UdA (entre qté et prix). */
  udaLabel: string;
  qtyAria: string;
  pricePlaceholder: string;
  totalPlaceholder: string;
  totalAria: string;
  /** Devise de saisie du vendeur ; défaut Dirham. */
  deviseAchat?: DeviseAchat;
  /** Libellé sous le total en Rial, ex. « Soit 3,25 DH ». */
  formatSoitDh?: (amountDh: number) => string;
  /** Commit parent uniquement au blur (évite de re-rendre tout le lot à chaque frappe). */
  onCommit: (lineId: string, changed: AchatPricingChanged, patch: AchatPricingCommit) => void;
};

function AchatLignePricingFields({
  lineId,
  qte,
  puText,
  totalText,
  editable,
  udaLabel,
  qtyAria,
  pricePlaceholder,
  totalPlaceholder,
  totalAria,
  deviseAchat = "dirham",
  formatSoitDh,
  onCommit,
}: Props) {
  const devise: DeviseAchat = deviseAchat === "rial" ? "rial" : "dirham";

  const puDisplay = useMemo(
    () => dhTextToDisplayText(puText, devise),
    [puText, devise],
  );
  const totalDisplay = useMemo(
    () => dhTextToDisplayText(totalText, devise),
    [totalText, devise],
  );

  const [puLocal, setPuLocal] = useState(puDisplay);
  const [totalLocal, setTotalLocal] = useState(totalDisplay);
  const [puFocused, setPuFocused] = useState(false);
  const [totalFocused, setTotalFocused] = useState(false);

  useEffect(() => {
    if (!puFocused) setPuLocal(puDisplay);
  }, [puDisplay, puFocused]);

  useEffect(() => {
    if (!totalFocused) setTotalLocal(totalDisplay);
  }, [totalDisplay, totalFocused]);

  const soitAmountDh = useMemo(() => {
    if (devise !== "rial") return null;
    const rial = parseMontantText(sanitizeMontantDhTypingFrac2(totalLocal));
    if (rial == null) return null;
    return rialToDh(rial);
  }, [devise, totalLocal]);

  return (
    <>
      <TableCell sx={{ minWidth: 0, verticalAlign: "top" }}>
        <DecimalQtyTextField
          size="small"
          fullWidth
          disabled={!editable}
          value={qte}
          commitWhileTyping={false}
          onQtyChange={(n) => onCommit(lineId, "qte", { qte_achat: n })}
          sx={{
            "& .MuiInputBase-input": {
              py: 0.65,
              px: 0.85,
              fontSize: "0.85rem",
            },
          }}
          slotProps={{ htmlInput: { "aria-label": qtyAria } }}
        />
      </TableCell>
      <TableCell
        align="center"
        sx={{
          whiteSpace: "nowrap",
          verticalAlign: "middle",
          fontSize: { xs: "0.8rem", sm: "inherit" },
        }}
      >
        {udaLabel}
      </TableCell>
      <TableCell sx={{ minWidth: 0, verticalAlign: "top" }}>
        <TextField
          size="small"
          fullWidth
          disabled={!editable}
          value={puLocal}
          placeholder={pricePlaceholder}
          onFocus={(ev: FocusEvent<HTMLInputElement>) => {
            setPuFocused(true);
            const el = ev.target as HTMLInputElement;
            queueMicrotask(() => el.select());
          }}
          onBlur={() => {
            setPuFocused(false);
            onCommit(lineId, "pu", {
              puText: displayTextToDhText(
                sanitizeMontantDhTypingFrac2(puLocal),
                devise,
              ),
            });
          }}
          onChange={(e) => setPuLocal(sanitizeMontantDhTypingFrac2(e.target.value))}
          slotProps={{
            htmlInput: { inputMode: "decimal" },
          }}
          sx={{ "& .MuiInputBase-input": { py: 0.65, px: 0.85, fontSize: "0.85rem" } }}
        />
      </TableCell>
      <TableCell sx={{ minWidth: 0, verticalAlign: "top" }}>
        <TextField
          size="small"
          fullWidth
          disabled={!editable}
          value={totalLocal}
          placeholder={totalPlaceholder}
          onFocus={(ev: FocusEvent<HTMLInputElement>) => {
            setTotalFocused(true);
            const el = ev.target as HTMLInputElement;
            queueMicrotask(() => el.select());
          }}
          onBlur={() => {
            setTotalFocused(false);
            onCommit(lineId, "total", {
              totalText: displayTextToDhText(
                sanitizeMontantDhTypingFrac2(totalLocal),
                devise,
              ),
            });
          }}
          onChange={(e) => setTotalLocal(sanitizeMontantDhTypingFrac2(e.target.value))}
          slotProps={{
            htmlInput: {
              inputMode: "decimal",
              "aria-label": totalAria,
            },
          }}
          sx={{
            "& .MuiInputBase-input": {
              py: 0.65,
              px: 0.85,
              fontSize: "0.85rem",
              textAlign: "center",
            },
          }}
        />
        {devise === "rial" && formatSoitDh != null && soitAmountDh != null ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.35, textAlign: "center", lineHeight: 1.2 }}
          >
            {formatSoitDh(soitAmountDh)}
          </Typography>
        ) : null}
      </TableCell>
    </>
  );
}

export default memo(AchatLignePricingFields);
