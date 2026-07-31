import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

type Props = {
  open: boolean;
  latestVersion: string | null;
  currentVersion?: string | null;
  error?: string | null;
  dismissLabel?: string;
  context?: "startup" | "manual";
  onClose: () => void;
  onConfirm: () => void;
};

export default function UpdateInstallConfirmDialog({
  open,
  latestVersion,
  currentVersion,
  error,
  dismissLabel = "Annuler",
  context = "manual",
  onClose,
  onConfirm,
}: Props) {
  const title = context === "startup" ? "Mise à jour disponible" : "Installer la mise à jour ?";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {context === "startup" ? (
          <Typography variant="body2" sx={{ mb: error ? 1.5 : 0 }}>
            {latestVersion && currentVersion
              ? `La version ${latestVersion} est téléchargée (vous êtes en ${currentVersion}).`
              : latestVersion
                ? `La version ${latestVersion} est téléchargée.`
                : "Une mise à jour est prête."}{" "}
            Installer maintenant avant d&apos;ouvrir la caisse ?
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ mb: error ? 1.5 : 0 }}>
            {latestVersion
              ? `La version ${latestVersion} va être installée.`
              : "La mise à jour va être installée."}{" "}
            La caisse va se fermer pendant l&apos;installation. Confirmer ?
          </Typography>
        )}
        {error ? (
          <Alert severity="error" sx={{ mt: 0 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>{dismissLabel}</Button>
        <Button variant="contained" color="primary" onClick={onConfirm}>
          Installer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
