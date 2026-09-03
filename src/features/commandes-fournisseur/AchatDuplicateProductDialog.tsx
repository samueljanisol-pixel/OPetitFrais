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

export type DuplicateLotLineInfo = {
  lotLigneId: string;
  productName: string | null;
  vendeurLabel: string | null;
};

type Props = {
  open: boolean;
  productName: string;
  existingLines: DuplicateLotLineInfo[];
  sansVendeurLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  labels: {
    title: string;
    intro: string;
    confirm: string;
    cancel: string;
  };
  formatAssignedTo: (vendeur: string) => string;
};

/** Confirmation : produit déjà chez un vendeur, ajout pour un autre vendeur. */
export default function AchatDuplicateProductDialog({
  open,
  productName,
  existingLines,
  sansVendeurLabel,
  busy,
  onClose,
  onConfirm,
  labels,
  formatAssignedTo,
}: Props) {
  return (
    <Dialog open={open} onClose={() => (!busy ? onClose() : undefined)} fullWidth maxWidth="sm">
      <DialogTitle>{labels.title}</DialogTitle>
      <DialogContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {productName}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {labels.intro}
        </Typography>
        <List dense disablePadding>
          {existingLines.map((line) => (
            <ListItem key={line.lotLigneId} disableGutters>
              <ListItemText
                primary={line.productName?.trim() || productName}
                secondary={formatAssignedTo(
                  line.vendeurLabel?.trim() || sansVendeurLabel,
                )}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          {labels.cancel}
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={busy}
          onClick={onConfirm}
          sx={{ textTransform: "none" }}
        >
          {labels.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
