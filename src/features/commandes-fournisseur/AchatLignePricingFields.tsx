"use client";

import { memo, useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
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
  /** `null` = quantité pas encore saisie (champ vide). */
  qte_achat?: number | null;
  /** Toujours en DH (stockage). */
  puText?: string;
  /** Toujours en DH (stockage). */
  totalText?: string;
};

export type AchatPricingChanged = "qte" | "pu" | "total";

type Props = {
  lineId: string;
  /** `null` = pas encore saisie. */
  qte: number | null;
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
  /**
   * Mise à jour « live » (sans setState parent) pendant la frappe —
   * permet à l’autosave / flush de voir les valeurs avant blur.
   */
  onPending?: (lineId: string, patch: AchatPricingCommit) => void;
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
  onPending,
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

  const puLocalRef = useRef(puLocal);
  puLocalRef.current = puLocal;
  const totalLocalRef = useRef(totalLocal);
  totalLocalRef.current = totalLocal;
  const puFocusedRef = useRef(puFocused);
  puFocusedRef.current = puFocused;
  const totalFocusedRef = useRef(totalFocused);
  totalFocusedRef.current = totalFocused;

  const onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const deviseRef = useRef(devise);
  deviseRef.current = devise;
  const lineIdRef = useRef(lineId);
  lineIdRef.current = lineId;

  useEffect(() => {
    if (!puFocused) setPuLocal(puDisplay);
  }, [puDisplay, puFocused]);

  useEffect(() => {
    if (!totalFocused) setTotalLocal(totalDisplay);
  }, [totalDisplay, totalFocused]);

  /** Flush des saisies locales encore focus / non commitées (démontage, remount tableau). */
  useEffect(() => {
    return () => {
      const id = lineIdRef.current;
      const d = deviseRef.current;
      const patch: AchatPricingCommit = {};
      let changed: AchatPricingChanged | null = null;
      if (puFocusedRef.current) {
        patch.puText = displayTextToDhText(
          sanitizeMontantDhTypingFrac2(puLocalRef.current),
          d,
        );
        changed = "pu";
      }
      if (totalFocusedRef.current) {
        patch.totalText = displayTextToDhText(
          sanitizeMontantDhTypingFrac2(totalLocalRef.current),
          d,
        );
        changed = changed === "pu" ? "pu" : "total";
      }
      if (changed == null) return;
      onPendingRef.current?.(id, patch);
      onCommitRef.current(id, changed, patch);
    };
  }, []);

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
          emptyAsNull
          commitWhileTyping={false}
          onQtyChange={(n) => {
            onPending?.(lineId, { qte_achat: n });
            onCommit(lineId, "qte", { qte_achat: n });
          }}
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
            const dh = displayTextToDhText(
              sanitizeMontantDhTypingFrac2(puLocalRef.current),
              devise,
            );
            onPending?.(lineId, { puText: dh });
            onCommit(lineId, "pu", { puText: dh });
            setPuLocal(dhTextToDisplayText(dh, devise));
            setPuFocused(false);
          }}
          onChange={(e) => {
            const next = sanitizeMontantDhTypingFrac2(e.target.value);
            setPuLocal(next);
            onPending?.(lineId, {
              puText: displayTextToDhText(next, devise),
            });
          }}
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
            const dh = displayTextToDhText(
              sanitizeMontantDhTypingFrac2(totalLocalRef.current),
              devise,
            );
            onPending?.(lineId, { totalText: dh });
            onCommit(lineId, "total", { totalText: dh });
            setTotalLocal(dhTextToDisplayText(dh, devise));
            setTotalFocused(false);
          }}
          onChange={(e) => {
            const next = sanitizeMontantDhTypingFrac2(e.target.value);
            setTotalLocal(next);
            onPending?.(lineId, {
              totalText: displayTextToDhText(next, devise),
            });
          }}
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
