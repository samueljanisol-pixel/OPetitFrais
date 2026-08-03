import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import {
  fetchCommandesBoutique,
  lockCommandeBoutique,
  type CommandeBoutiqueItem,
} from "../lib/commandes-boutique";

type Props = {
  open: boolean;
  magasinCode: string;
  caisseCode: string;
  onClose: () => void;
  onSelect: (item: { cartId: string; cartNumber: number; clientId: string | null; clientName: string | null }) => void;
};

export default function CommandesBoutiqueDialog({
  open,
  magasinCode,
  caisseCode,
  onClose,
  onSelect,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<CommandeBoutiqueItem[]>([]);
  const [locking, setLocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const result = await fetchCommandesBoutique(magasinCode, caisseCode);
    setItems(result.commandes);
    setErr(result.error);
    setLoading(false);
  }, [magasinCode, caisseCode]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handlePick = async (item: CommandeBoutiqueItem) => {
    if (item.caisseLockState === "locked_other") return;
    setLocking(item.cartId);
    setErr(null);
    const lock = await lockCommandeBoutique({
      cartId: item.cartId,
      magasinCode,
      caisseCode,
    });
    setLocking(null);
    if (!lock.ok) {
      setErr(lock.error);
      void load();
      return;
    }
    onSelect({
      cartId: item.cartId,
      cartNumber: item.cartNumber,
      clientId: lock.clientId ?? item.clientId,
      clientName: lock.clientName ?? item.clientName,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Commandes à passer en caisse</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 1 }}>
            {err}
          </Alert>
        ) : null}
        {loading ? (
          <CircularProgress size={28} />
        ) : items.length === 0 ? (
          <Typography color="text.secondary">Aucune commande en attente.</Typography>
        ) : (
          <List dense>
            {items.map((item) => {
              const disabled = item.caisseLockState === "locked_other" || locking === item.cartId;
              const secondary =
                item.caisseLockState === "locked_other"
                  ? `En cours — ${item.caisseLockLabel ?? "?"}`
                  : item.clientName ?? "Sans client";
              return (
                <ListItem key={item.cartId} disablePadding>
                  <ListItemButton disabled={disabled} onClick={() => void handlePick(item)}>
                    <ListItemText
                      primary={`#${item.cartNumber}`}
                      secondary={secondary}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
        <Button onClick={() => void load()} disabled={loading}>
          Actualiser
        </Button>
      </DialogActions>
    </Dialog>
  );
}
