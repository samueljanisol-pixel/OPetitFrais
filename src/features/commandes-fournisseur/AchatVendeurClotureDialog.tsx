"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";

export type VendeurClotureIssue = {
  lotLigneId: string;
  productName: string | null;
};

type Props = {
  open: boolean;
  vendorLabel: string;
  missingPuLines: VendeurClotureIssue[];
  needConfirmLines: VendeurClotureIssue[];
  busy: boolean;
  onClose: () => void;
  onConfirmZeros: () => void;
  labels: {
    title: string;
    missingPu: string;
    zeroQty: string;
    confirmZeros: string;
    cancel: string;
    close: string;
  };
};

/** Confirmation / manquements avant clôture d’un vendeur (lecture seule → Dialog standard). */
export default function AchatVendeurClotureDialog({
  open,
  vendorLabel,
  missingPuLines,
  needConfirmLines,
  busy,
  onClose,
  onConfirmZeros,
  labels,
}: Props) {
  const hasMissingPu = missingPuLines.length > 0;
  const hasZeros = needConfirmLines.length > 0 && !hasMissingPu;

  return (
    <Dialog open={open} onClose={() => (!busy ? onClose() : undefined)} fullWidth maxWidth="sm">
      <DialogTitle>
        {labels.title} — {vendorLabel}
      </DialogTitle>
      <DialogContent>
        {hasMissingPu ? (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {labels.missingPu}
            </Typography>
            <List dense disablePadding>
              {missingPuLines.map((l) => (
                <ListItem key={l.lotLigneId} disableGutters>
                  <ListItemText primary={l.productName?.trim() || l.lotLigneId} />
                </ListItem>
              ))}
            </List>
          </>
        ) : null}
        {hasZeros ? (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {labels.zeroQty}
            </Typography>
            <List dense disablePadding>
              {needConfirmLines.map((l) => (
                <ListItem key={l.lotLigneId} disableGutters>
                  <ListItemText primary={l.productName?.trim() || l.lotLigneId} />
                </ListItem>
              ))}
            </List>
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          {hasMissingPu ? labels.close : labels.cancel}
        </Button>
        {hasZeros ? (
          <Button
            variant="contained"
            disabled={busy}
            onClick={onConfirmZeros}
            sx={{ textTransform: "none" }}
          >
            {labels.confirmZeros}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
