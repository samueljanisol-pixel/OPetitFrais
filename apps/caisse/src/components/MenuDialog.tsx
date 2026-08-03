import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Box,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ScaleOutlinedIcon from "@mui/icons-material/ScaleOutlined";
import { formatCashierClock } from "../lib/status-bar";

type Props = {
  open: boolean;
  catalogLoading?: boolean;
  saurusSending?: boolean;
  lastTicketAvailable?: boolean;
  lastTicketPaidAt?: Date | null;
  onClose: () => void;
  onRefreshPrices: () => void;
  onSendSaurusPrices: () => void;
  onReprintLastTicket: () => void;
  onOpenCommandesBoutique?: () => void;
  onOpenSettings: () => void;
  onQuitApp: () => void;
};

export default function MenuDialog({
  open,
  catalogLoading = false,
  saurusSending = false,
  lastTicketAvailable = false,
  lastTicketPaidAt = null,
  onClose,
  onRefreshPrices,
  onSendSaurusPrices,
  onReprintLastTicket,
  onOpenCommandesBoutique,
  onOpenSettings,
  onQuitApp,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Menu</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.25, pt: 0.5 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={catalogLoading ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
          disabled={catalogLoading}
          onClick={() => {
            onRefreshPrices();
            onClose();
          }}
          sx={{ justifyContent: "flex-start", py: 1.25, fontWeight: 700 }}
        >
          Actualiser les prix
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={
            saurusSending ? <CircularProgress size={20} color="inherit" /> : <ScaleOutlinedIcon />
          }
          disabled={saurusSending || catalogLoading}
          onClick={() => {
            onSendSaurusPrices();
          }}
          sx={{ justifyContent: "flex-start", py: 1.25, fontWeight: 700 }}
        >
          Envoyer prix balance SAURUS
        </Button>
        <Box>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            startIcon={<ReceiptLongOutlinedIcon />}
            disabled={!lastTicketAvailable}
            onClick={() => {
              onReprintLastTicket();
              onClose();
            }}
            sx={{ justifyContent: "flex-start", py: 1.25, fontWeight: 700 }}
          >
            Imprimer dernier ticket
          </Button>
          {lastTicketAvailable && lastTicketPaidAt ? (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.35,
                pl: 0.5,
                fontSize: 10,
                lineHeight: 1.2,
                fontVariantNumeric: "tabular-nums",
                color: "text.secondary",
              }}
            >
              {formatCashierClock(lastTicketPaidAt)}
            </Typography>
          ) : null}
        </Box>
        {onOpenCommandesBoutique ? (
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={() => {
              onOpenCommandesBoutique();
              onClose();
            }}
            sx={{ justifyContent: "flex-start", py: 1.25, fontWeight: 700 }}
          >
            Commandes boutique
          </Button>
        ) : null}
        <Button
          variant="outlined"
          size="large"
          startIcon={<SettingsOutlinedIcon />}
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
          sx={{ justifyContent: "flex-start", py: 1.25, fontWeight: 700 }}
        >
          Paramètres
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="large"
          startIcon={<PowerSettingsNewIcon />}
          onClick={() => {
            onClose();
            onQuitApp();
          }}
          sx={{ justifyContent: "flex-start", py: 1.25, fontWeight: 700 }}
        >
          Fermer caisse
        </Button>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Fermer</Button>
      </DialogActions>
    </Dialog>
  );
}
