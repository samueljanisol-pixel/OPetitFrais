import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import FormDialog from "./FormDialog";
import AdminPinDialog from "./AdminPinDialog";
import AdminSettingsDialog from "./AdminSettingsDialog";
import {
  getCaisseRuntimeConfig,
  isCaisseAgentReachable,
  listScalePortOptions,
  listTicketPrinterOptions,
  saveCaisseHardwareConfig,
} from "../lib/hardware-config";
import { withTimeout } from "../lib/fetch-timeout";

const AUTO_SCALE_VALUE = "__auto__";
const NO_PRINTER_VALUE = "";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function SettingsDialog({ open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scalePort, setScalePort] = useState(AUTO_SCALE_VALUE);
  const [saurusScaleIp, setSaurusScaleIp] = useState("");
  const [ticketPrinter, setTicketPrinter] = useState(NO_PRINTER_VALUE);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [ports, setPorts] = useState<Array<{ path: string; manufacturer: string | null }>>([]);
  const [printers, setPrinters] = useState<string[]>([]);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setLoading(true);

    void (async () => {
      try {
        const configPromise = getCaisseRuntimeConfig();
        const agentPromise = withTimeout(isCaisseAgentReachable(), 2_500, false);
        const portsPromise = withTimeout(listScalePortOptions(), 6_000, [] as Array<{ path: string; manufacturer: string | null }>);
        const printersPromise = withTimeout(listTicketPrinterOptions(), 6_000, [] as string[]);

        const [config, agentOk, portOptions, printerOptions] = await Promise.all([
          configPromise,
          agentPromise,
          portsPromise,
          printersPromise,
        ]);

        if (cancelled) return;

        setAgentOnline(agentOk);
        setPorts(portOptions);
        setPrinters(printerOptions);

        const savedScale = config.scalePort.trim();
        const scaleValues = new Set([AUTO_SCALE_VALUE, ...portOptions.map((p) => p.path)]);
        setScalePort(scaleValues.has(savedScale) && savedScale.length > 0 ? savedScale : AUTO_SCALE_VALUE);

        setSaurusScaleIp(config.saurusScaleIp.trim());

        const savedPrinter = config.ticketPrinter.trim();
        setTicketPrinter(
          savedPrinter.length > 0 && printerOptions.includes(savedPrinter)
            ? savedPrinter
            : NO_PRINTER_VALUE,
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Impossible de charger les paramètres");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setAdminPinOpen(false);
    setAdminOpen(false);
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    setAdminPinOpen(false);
    setAdminOpen(false);
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCaisseHardwareConfig({
        scalePort: scalePort === AUTO_SCALE_VALUE ? "" : scalePort,
        saurusScaleIp: saurusScaleIp.trim(),
        ticketPrinter,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <FormDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Paramètres</DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "24px !important" }}
      >
        {error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && agentOnline === false ? (
          <Alert severity="warning">
            Service balance local indisponible (port 4711). Redémarrez la caisse — depuis la version
            0.1.7 l&apos;agent est intégré à l&apos;application, Node.js n&apos;est plus requis.
          </Alert>
        ) : null}

        {!loading && ports.length === 0 ? (
          <Alert severity="info">
            Aucun port COM détecté. Vérifiez le câble USB, le pilote CH340 (wch.cn) dans le Gestionnaire de
            périphériques, puis rouvrez Paramètres.
          </Alert>
        ) : null}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <FormControl fullWidth>
              <InputLabel id="settings-scale-port-label">Port COM balance</InputLabel>
              <Select
                labelId="settings-scale-port-label"
                label="Port COM balance"
                value={scalePort}
                onChange={(e) => setScalePort(e.target.value)}
              >
                <MenuItem value={AUTO_SCALE_VALUE}>Auto (détection CH340)</MenuItem>
                {ports.map((port) => (
                  <MenuItem key={port.path} value={port.path}>
                    {port.path}
                    {port.manufacturer ? ` — ${port.manufacturer}` : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Adresse IP balance SAURUS"
              value={saurusScaleIp}
              onChange={(e) => setSaurusScaleIp(e.target.value)}
              fullWidth
              placeholder="192.168.0.87"
              helperText="Protocole UDP port 5001 (envoi catalogue PLU depuis le menu caisse)"
            />

            <FormControl fullWidth>
              <InputLabel id="settings-ticket-printer-label">Imprimante ticket</InputLabel>
              <Select
                labelId="settings-ticket-printer-label"
                label="Imprimante ticket"
                value={ticketPrinter}
                onChange={(e) => setTicketPrinter(e.target.value)}
              >
                <MenuItem value={NO_PRINTER_VALUE}>Aucune</MenuItem>
                {printers.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              fullWidth
              disabled={saving}
              onClick={() => setAdminPinOpen(true)}
            >
              Accès paramètres admin
            </Button>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={handleClose} disabled={saving}>
          Annuler
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || loading}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogActions>
    </FormDialog>

      <AdminPinDialog
        open={adminPinOpen}
        onClose={() => setAdminPinOpen(false)}
        onUnlocked={() => {
          setAdminPinOpen(false);
          setAdminOpen(true);
        }}
      />
      <AdminSettingsDialog open={adminOpen} onClose={() => setAdminOpen(false)} onSaved={onSaved} />
    </>
  );
}
