import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { formatMoneyFr } from "@opf/caisse-core";
import { useCallback, useEffect, useState } from "react";
import {
  fetchCommandesAEncaisser,
  fetchCommandesBoutique,
  lockCommandeBoutique,
  type CommandeBoutiqueItem,
  type CommandeEncaissementItem,
} from "../lib/commandes-boutique";

type PasserCaissePick = {
  cartId: string;
  cartNumber: number;
  clientId: string | null;
  clientName: string | null;
};

type Props = {
  open: boolean;
  magasinCode: string;
  caisseCode: string;
  onClose: () => void;
  onSelectPasserCaisse: (item: PasserCaissePick) => void;
  onSelectEncaisser: (item: CommandeEncaissementItem) => void;
};

export default function CommandesBoutiqueDialog({
  open,
  magasinCode,
  caisseCode,
  onClose,
  onSelectPasserCaisse,
  onSelectEncaisser,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [passerItems, setPasserItems] = useState<CommandeBoutiqueItem[]>([]);
  const [encaissementItems, setEncaissementItems] = useState<CommandeEncaissementItem[]>([]);
  const [locking, setLocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [passer, encaissement] = await Promise.all([
      fetchCommandesBoutique(magasinCode, caisseCode),
      fetchCommandesAEncaisser(magasinCode),
    ]);
    setPasserItems(passer.commandes);
    setEncaissementItems(encaissement.commandes);
    setErr(passer.error ?? encaissement.error);
    setLoading(false);
  }, [magasinCode, caisseCode]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handlePickPasserCaisse = async (item: CommandeBoutiqueItem) => {
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
    onSelectPasserCaisse({
      cartId: item.cartId,
      cartNumber: item.cartNumber,
      clientId: lock.clientId ?? item.clientId,
      clientName: lock.clientName ?? item.clientName,
    });
    onClose();
  };

  const handlePickEncaisser = (item: CommandeEncaissementItem) => {
    onSelectEncaisser(item);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Commandes boutique</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 1 }}>
            {err}
          </Alert>
        ) : null}
        {loading ? (
          <CircularProgress size={28} />
        ) : (
          <>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              À passer en caisse
            </Typography>
            {passerItems.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Aucune commande en attente.
              </Typography>
            ) : (
              <List dense disablePadding sx={{ mb: 2 }}>
                {passerItems.map((item) => {
                  const disabled = item.caisseLockState === "locked_other" || locking === item.cartId;
                  const secondary =
                    item.caisseLockState === "locked_other"
                      ? `En cours — ${item.caisseLockLabel ?? "?"}`
                      : item.clientName ?? "Sans client";
                  return (
                    <ListItem key={item.cartId} disablePadding>
                      <ListItemButton disabled={disabled} onClick={() => void handlePickPasserCaisse(item)}>
                        <ListItemText primary={`#${item.cartNumber}`} secondary={secondary} />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}

            <Divider sx={{ mb: 1.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              À encaisser
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Espèce livraison/retrait ou commande non payée à la livraison.
            </Typography>
            {encaissementItems.length === 0 ? (
              <Typography color="text.secondary">Aucun encaissement en attente.</Typography>
            ) : (
              <List dense disablePadding>
                {encaissementItems.map((item) => (
                  <ListItem key={item.cartId} disablePadding>
                    <ListItemButton onClick={() => handlePickEncaisser(item)}>
                      <ListItemText
                        primary={`#${item.cartNumber} — ${formatMoneyFr(item.montant)} DH`}
                        secondary={`${item.clientName ?? "Sans client"} · ${item.encaissementLabel}`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </>
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
