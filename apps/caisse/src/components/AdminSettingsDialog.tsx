import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import FormDialog from "./FormDialog";
import { getCaisseRuntimeConfig, saveCaisseFtpConfig } from "../lib/hardware-config";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function AdminSettingsDialog({ open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ftpHost, setFtpHost] = useState("");
  const [ftpUser, setFtpUser] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setLoading(true);

    void (async () => {
      try {
        const config = await getCaisseRuntimeConfig();
        if (cancelled) return;
        setFtpHost(config.ftpHost?.trim() ?? "");
        setFtpUser(config.ftpUser?.trim() ?? "");
        setFtpPassword(config.ftpPassword ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Impossible de charger les paramètres admin");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCaisseFtpConfig({
        ftpHost: ftpHost.trim(),
        ftpUser: ftpUser.trim(),
        ftpPassword,
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
    <FormDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Paramètres Admin</DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "24px !important" }}
      >
        {error ? <Alert severity="error">{error}</Alert> : null}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TextField
              label="FTP ventes — hôte"
              value={ftpHost}
              onChange={(e) => setFtpHost(e.target.value)}
              fullWidth
              placeholder="ftp.exemple.com"
              helperText="Envoi vers /ventes_caisses/MXX/CXX toutes les 10 min s’il y a des ventes"
            />
            <TextField
              label="FTP ventes — utilisateur"
              value={ftpUser}
              onChange={(e) => setFtpUser(e.target.value)}
              fullWidth
              autoComplete="off"
            />
            <TextField
              label="FTP ventes — mot de passe"
              type="password"
              value={ftpPassword}
              onChange={(e) => setFtpPassword(e.target.value)}
              fullWidth
              autoComplete="new-password"
            />
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
  );
}
