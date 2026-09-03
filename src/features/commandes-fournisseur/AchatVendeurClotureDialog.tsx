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
  vendeurLabel?: string | null;
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
  onConfirmForceMissingQty: () => void;
  labels: {
    title: string;
    missingQty: string;
    forceMissingQtyHint: string;
    missingPu: string;
    noPhotos: string;
    confirmNoPhotos: string;
    confirmForceMissingQty: string;
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
  onConfirmForceMissingQty,
  labels,
}: Props) {
  const hasMissingQty = missingQtyLines.length > 0;
  const hasMissingPu = missingPuLines.length > 0 && !hasMissingQty;
  const hasBlockingPu = hasMissingPu;
  const showNoPhotos = noPhotos && !hasMissingQty && !hasMissingPu;

  return (
    <Dialog open={open} onClose={() => (!busy ? onClose() : undefined)} fullWidth maxWidth="sm">
      <DialogTitle>
        {vendorLabel.trim() ? `${labels.title} — ${vendorLabel}` : labels.title}
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
                  <ListItemText
                    primary={l.productName?.trim() || l.lotLigneId}
                    secondary={
                      typeof l.vendeurLabel === "string" && l.vendeurLabel.trim().length > 0
                        ? l.vendeurLabel.trim()
                        : undefined
                    }
                  />
                </ListItem>
              ))}
            </List>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {labels.forceMissingQtyHint}
            </Typography>
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
                  <ListItemText
                    primary={l.productName?.trim() || l.lotLigneId}
                    secondary={
                      typeof l.vendeurLabel === "string" && l.vendeurLabel.trim().length > 0
                        ? l.vendeurLabel.trim()
                        : undefined
                    }
                  />
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
          {hasMissingQty || hasBlockingPu ? labels.cancel : labels.close}
        </Button>
        {hasMissingQty ? (
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={onConfirmForceMissingQty}
            sx={{ textTransform: "none" }}
          >
            {labels.confirmForceMissingQty}
          </Button>
        ) : null}
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
