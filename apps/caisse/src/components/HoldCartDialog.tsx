import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PauseCircleOutlineOutlinedIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import { formatMoneyDh } from "@opf/caisse-core";
import type { CartState } from "@opf/caisse-core";
import {
  formatHeldAt,
  heldCartLabel,
  heldCartSummary,
  type HeldCartEntry,
} from "../lib/cart-holds";

type Props = {
  open: boolean;
  currentCart: CartState;
  currentLineCount: number;
  holds: HeldCartEntry[];
  onClose: () => void;
  onHoldCurrent: () => void;
  onRecall: (id: string) => void;
  onDeleteHold: (id: string) => void;
};

export default function HoldCartDialog({
  open,
  currentCart,
  currentLineCount,
  holds,
  onClose,
  onHoldCurrent,
  onRecall,
  onDeleteHold,
}: Props) {
  const canHoldCurrent = currentLineCount > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <PauseCircleOutlineOutlinedIcon color="primary" />
        Paniers en attente
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {canHoldCurrent ? (
          <Button
            fullWidth
            variant="contained"
            sx={{ mb: 2 }}
            onClick={() => {
              onHoldCurrent();
              onClose();
            }}
          >
            Mettre le panier actuel en attente
            {currentCart.clientName ? ` (${currentCart.clientName})` : ""}
            {" — "}
            {currentLineCount} ligne(s)
          </Button>
        ) : null}

        {holds.length === 0 ? (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
            Aucun panier en attente
          </Typography>
        ) : (
          <List dense disablePadding>
            {holds.map((entry, index) => {
              const { lineCount, total } = heldCartSummary(entry);
              const label = heldCartLabel(entry, index);
              return (
                <ListItem
                  key={entry.id}
                  disablePadding
                  secondaryAction={
                    <IconButton edge="end" aria-label="Supprimer" onClick={() => onDeleteHold(entry.id)}>
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  }
                  sx={{ mb: 0.5, border: 1, borderColor: "divider", borderRadius: 1 }}
                >
                  <ListItemButton onClick={() => onRecall(entry.id)}>
                    <ListItemText
                      primary={label}
                      secondary={`${lineCount} ligne(s) — ${formatMoneyDh(total)} — ${formatHeldAt(entry.heldAt)}`}
                      primaryTypographyProps={{ fontWeight: 700, fontSize: 14 }}
                      secondaryTypographyProps={{ fontSize: 12 }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}

        {canHoldCurrent && holds.length > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Cliquez sur un panier en attente pour le rappeler (le panier actuel sera aussi mis en attente).
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Fermer</Button>
      </DialogActions>
    </Dialog>
  );
}
