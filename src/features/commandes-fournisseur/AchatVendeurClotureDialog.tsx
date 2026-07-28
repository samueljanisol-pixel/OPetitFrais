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
  missingQtyLines: VendeurClotureIssue[];
  missingPuLines: VendeurClotureIssue[];
  /** Aucune photo hors image commande WhatsApp. */
  noPhotos: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirmNoPhotos: () => void;
  labels: {
    title: string;
    missingQty: string;
    missingPu: string;
    noPhotos: string;
    confirmNoPhotos: string;
    cancel: string;
    close: string;
  };
};

/** Confirmation / manquements avant clôture d’un vendeur (lecture seule → Dialog standard). */
export default function AchatVendeurClotureDialog({
  open,
  vendorLabel,
  missingQtyLines,
  missingPuLines,
  noPhotos,
  busy,
  onClose,
  onConfirmNoPhotos,
  labels,
}: Props) {
  const hasMissingQty = missingQtyLines.length > 0;
  const hasMissingPu = missingPuLines.length > 0 && !hasMissingQty;
  const hasBlocking = hasMissingQty || hasMissingPu;
  const showNoPhotos = noPhotos && !hasBlocking;

  return (
    <Dialog open={open} onClose={() => (!busy ? onClose() : undefined)} fullWidth maxWidth="sm">
      <DialogTitle>
        {labels.title} — {vendorLabel}
      </DialogTitle>
      <DialogContent>
        {hasMissingQty ? (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {labels.missingQty}
            </Typography>
            <List dense disablePadding>
              {missingQtyLines.map((l) => (
                <ListItem key={l.lotLigneId} disableGutters>
                  <ListItemText primary={l.productName?.trim() || l.lotLigneId} />
                </ListItem>
              ))}
            </List>
          </>
        ) : null}
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
        {showNoPhotos ? (
          <Typography variant="body2">{labels.noPhotos}</Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          {hasBlocking ? labels.close : labels.cancel}
        </Button>
        {showNoPhotos ? (
          <Button
            variant="contained"
            disabled={busy}
            onClick={onConfirmNoPhotos}
            sx={{ textTransform: "none" }}
          >
            {labels.confirmNoPhotos}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
