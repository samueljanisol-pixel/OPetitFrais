import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { formatMoneyFr } from "@opf/caisse-core";
import { useCallback, useEffect, useState } from "react";
import { printEscPosBase64 } from "../lib/agent";
import {
  fetchCommandesAEncaisser,
  fetchCommandesBoutique,
  fetchPreparationTicketEscPosBase64,
  lockCommandeBoutique,
  preparationActionCommandeBoutique,
  unlockCommandeBoutique,
  type CommandeBoutiqueItem,
  type CommandeEncaissementItem,
} from "../lib/commandes-boutique";

export type PasserCaissePick = {
  cartId: string;
  cartNumber: number;
  clientId: string | null;
  clientName: string | null;
  /** Reprise d’une commande déjà en cours / en attente. */
  resume?: boolean;
};

type Props = {
  open: boolean;
  magasinCode: string;
  caisseCode: string;
  ticketPrinter: string;
  onClose: () => void;
  onSelectPasserCaisse: (item: PasserCaissePick) => void;
  onSelectEncaisser: (item: CommandeEncaissementItem) => void;
};

function statusLabel(status: string | null | undefined): string {
  if (status === "en_attente_caisse") return "En attente";
  if (status === "en_cours_caisse") return "En cours";
  return "En caisse";
}

function fulfillmentShort(mode: string | null): string {
  if (mode === "pickup") return "Retrait";
  if (mode === "home") return "Livraison";
  return "";
}

export default function CommandesBoutiqueDialog({
  open,
  magasinCode,
  caisseCode,
  ticketPrinter,
  onClose,
  onSelectPasserCaisse,
  onSelectEncaisser,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [passerItems, setPasserItems] = useState<CommandeBoutiqueItem[]>([]);
  const [enCoursItems, setEnCoursItems] = useState<CommandeBoutiqueItem[]>([]);
  const [aPreparerItems, setAPreparerItems] = useState<CommandeBoutiqueItem[]>([]);
  const [enPreparationItems, setEnPreparationItems] = useState<CommandeBoutiqueItem[]>([]);
  const [encaissementItems, setEncaissementItems] = useState<CommandeEncaissementItem[]>([]);
  const [locking, setLocking] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [passer, encaissement] = await Promise.all([
      fetchCommandesBoutique(magasinCode, caisseCode),
      fetchCommandesAEncaisser(magasinCode),
    ]);
    setPasserItems(passer.commandes);
    setEnCoursItems(passer.enCours);
    setAPreparerItems(passer.aPreparer);
    setEnPreparationItems(passer.enPreparation);
    setEncaissementItems(encaissement.commandes);
    setErr(passer.error ?? encaissement.error);
    setLoading(false);
  }, [magasinCode, caisseCode]);

  useEffect(() => {
    if (open) {
      setInfo(null);
      void load();
    }
  }, [open, load]);

  const takeOrder = async (item: CommandeBoutiqueItem, resume: boolean) => {
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
      resume,
    });
    onClose();
  };

  const handleRelease = async (item: CommandeBoutiqueItem) => {
    setReleasing(item.cartId);
    setErr(null);
    const result = await unlockCommandeBoutique({
      cartId: item.cartId,
      magasinCode,
      caisseCode,
    });
    setReleasing(null);
    if (!result.ok) {
      setErr(result.error);
    }
    void load();
  };

  const handlePrintPreparation = async (item: CommandeBoutiqueItem) => {
    setPrinting(item.cartId);
    setErr(null);
    setInfo(null);
    const ticket = await fetchPreparationTicketEscPosBase64(item.cartId);
    if (!ticket.base64) {
      setErr(ticket.error ?? "Impression impossible");
      setPrinting(null);
      return;
    }
    const printed = await printEscPosBase64(ticket.base64, { ticketPrinter });
    setPrinting(null);
    if (!printed.ok) {
      setErr(printed.error);
      return;
    }
    setInfo(`Commande #${item.cartNumber} imprimée`);
  };

  const handlePreparationAction = async (
    item: CommandeBoutiqueItem,
    action: "start" | "back" | "finish",
  ) => {
    setActing(`${action}:${item.cartId}`);
    setErr(null);
    setInfo(null);
    const result = await preparationActionCommandeBoutique({ cartId: item.cartId, action });
    setActing(null);
    if (!result.ok) {
      setErr(result.error);
      void load();
      return;
    }
    if (action === "start") setInfo(`Commande #${item.cartNumber} en préparation`);
    if (action === "back") setInfo(`Commande #${item.cartNumber} remise à préparer`);
    if (action === "finish") setInfo(`Commande #${item.cartNumber} à passer en caisse`);
    void load();
  };

  const handlePickEncaisser = (item: CommandeEncaissementItem) => {
    onSelectEncaisser(item);
    onClose();
  };

  const prepSecondary = (item: CommandeBoutiqueItem) =>
    [item.clientName ?? "Sans client", fulfillmentShort(item.fulfillmentMode)]
      .filter(Boolean)
      .join(" · ");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Commandes boutique</DialogTitle>
      <DialogContent>
        {err ? (
          <Alert severity="error" sx={{ mb: 1 }}>
            {err}
          </Alert>
        ) : null}
        {info ? (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setInfo(null)}>
            {info}
          </Alert>
        ) : null}
        {loading ? (
          <CircularProgress size={28} />
        ) : (
          <>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              À préparer
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Clic = imprimer la check-list (par catégorie). Puis « Préparer ».
            </Typography>
            {aPreparerItems.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Aucune commande à préparer.
              </Typography>
            ) : (
              <List dense disablePadding sx={{ mb: 2 }}>
                {aPreparerItems.map((item) => {
                  const busy = printing === item.cartId || acting === `start:${item.cartId}`;
                  return (
                    <ListItem
                      key={item.cartId}
                      disablePadding
                      sx={{ mb: 0.5, border: 1, borderColor: "divider", borderRadius: 1, flexDirection: "column", alignItems: "stretch" }}
                    >
                      <ListItemButton
                        disabled={busy}
                        onClick={() => void handlePrintPreparation(item)}
                        sx={{ py: 0.75 }}
                      >
                        <ListItemText
                          primary={`#${item.cartNumber}`}
                          secondary={prepSecondary(item)}
                        />
                        <PrintOutlinedIcon fontSize="small" color="action" sx={{ ml: 1 }} />
                      </ListItemButton>
                      <Box sx={{ px: 1, pb: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          fullWidth
                          disabled={busy}
                          onClick={() => void handlePreparationAction(item, "start")}
                          sx={{ fontWeight: 700 }}
                        >
                          Préparer
                        </Button>
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            )}

            <Divider sx={{ mb: 1.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              En préparation
            </Typography>
            {enPreparationItems.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Aucune commande en préparation.
              </Typography>
            ) : (
              <List dense disablePadding sx={{ mb: 2 }}>
                {enPreparationItems.map((item) => {
                  const busy =
                    printing === item.cartId ||
                    acting === `back:${item.cartId}` ||
                    acting === `finish:${item.cartId}`;
                  return (
                    <ListItem
                      key={item.cartId}
                      disablePadding
                      sx={{ mb: 0.5, border: 1, borderColor: "divider", borderRadius: 1, flexDirection: "column", alignItems: "stretch" }}
                    >
                      <ListItemButton
                        disabled={busy}
                        onClick={() => void handlePrintPreparation(item)}
                        sx={{ py: 0.75 }}
                      >
                        <ListItemText
                          primary={`#${item.cartNumber}`}
                          secondary={prepSecondary(item)}
                        />
                        <PrintOutlinedIcon fontSize="small" color="action" sx={{ ml: 1 }} />
                      </ListItemButton>
                      <Stack direction="row" spacing={0.75} sx={{ px: 1, pb: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          fullWidth
                          disabled={busy}
                          onClick={() => void handlePreparationAction(item, "back")}
                          sx={{ fontWeight: 700, fontSize: 11 }}
                        >
                          À préparer
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="secondary"
                          fullWidth
                          disabled={busy}
                          onClick={() => void handlePreparationAction(item, "finish")}
                          sx={{ fontWeight: 700, fontSize: 11 }}
                        >
                          À passer en caisse
                        </Button>
                      </Stack>
                    </ListItem>
                  );
                })}
              </List>
            )}

            <Divider sx={{ mb: 1.5 }} />

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
                      <ListItemButton disabled={disabled} onClick={() => void takeOrder(item, false)}>
                        <ListItemText primary={`#${item.cartNumber}`} secondary={secondary} />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}

            <Divider sx={{ mb: 1.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              En cours / En attente
            </Typography>
            {enCoursItems.length === 0 ? (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Aucune commande en cours ou en attente.
              </Typography>
            ) : (
              <List dense disablePadding sx={{ mb: 2 }}>
                {enCoursItems.map((item) => {
                  const disabled =
                    item.caisseLockState === "locked_other" ||
                    locking === item.cartId ||
                    releasing === item.cartId;
                  const secondary = [
                    statusLabel(item.workflowStatus),
                    item.clientName ?? "Sans client",
                    item.caisseLockState === "locked_other"
                      ? item.caisseLockLabel ?? "?"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <ListItem
                      key={item.cartId}
                      disablePadding
                      secondaryAction={
                        item.caisseLockState !== "locked_other" ? (
                          <IconButton
                            edge="end"
                            aria-label="Remettre à passer en caisse"
                            disabled={releasing === item.cartId}
                            onClick={() => void handleRelease(item)}
                          >
                            <DeleteOutlineOutlinedIcon fontSize="small" />
                          </IconButton>
                        ) : null
                      }
                      sx={{ mb: 0.5, border: 1, borderColor: "divider", borderRadius: 1 }}
                    >
                      <ListItemButton disabled={disabled} onClick={() => void takeOrder(item, true)}>
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
              Espèce livraison/retrait ou commande non payée à la livraison. N’affecte pas le panier
              en cours.
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
