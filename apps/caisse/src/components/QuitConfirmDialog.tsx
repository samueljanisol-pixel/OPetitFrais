import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function QuitConfirmDialog({ open, onClose, onConfirm }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Quitter le logiciel ?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Le logiciel va se fermer. Si une session est ouverte, elle reste ouverte : au prochain
          lancement, la caisse sera verrouillée.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>
          Quitter
        </Button>
      </DialogActions>
    </Dialog>
  );
}
