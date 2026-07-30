import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import FormDialog from "./FormDialog";
import { isTestMagasin } from "../lib/caisse-identity";
import { registerPosteOnServer } from "../lib/poste-register";
import type { CaisseIdentityDraft, CaisseIdentityStatus } from "../lib/caisse-identity";

type Props = {
  open: boolean;
  status: CaisseIdentityStatus | null;
  onComplete: () => void;
};

export default function SetupDialog({ open, status, onComplete }: Props) {
  const [backofficeUrl, setBackofficeUrl] = useState("");
  const [caisseToken, setCaisseToken] = useState("");
  const [magasinCode, setMagasinCode] = useState("");
  const [caisseCode, setCaisseCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !status) return;
    setError(null);
    setBackofficeUrl(status.draft.backofficeUrl?.trim() || "https://opetitfrais.janisol.ma");
    setCaisseToken(status.draft.caisseToken?.trim() || "");
    setMagasinCode(status.draft.magasinCode?.trim() || "");
    setCaisseCode(status.draft.caisseCode?.trim() || "");
  }, [open, status]);

  const testMode = isTestMagasin(magasinCode);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const draft: CaisseIdentityDraft = {
      backofficeUrl: backofficeUrl.trim(),
      caisseToken: caisseToken.trim(),
      magasinCode: magasinCode.trim(),
      caisseCode: caisseCode.trim(),
    };

    const posteId = status?.draft.posteId?.trim() || crypto.randomUUID();

    const registered = await registerPosteOnServer({ ...draft, posteId });
    if (!registered.ok) {
      setError(registered.error);
      setSaving(false);
      return;
    }

    try {
      if (!window.caisseApi?.saveIdentityConfig) {
        throw new Error("Enregistrement local indisponible");
      }
      await window.caisseApi.saveIdentityConfig({
        backofficeUrl: backofficeUrl.trim(),
        caisseToken: caisseToken.trim(),
        magasinCode: registered.magasinCode,
        caisseCode: registered.caisseCode,
        posteId: registered.posteId,
      });
      await window.caisseApi.notifyIdentityReady?.();
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open={open} onClose={() => {}} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Configuration du poste</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Renseignez l&apos;identité de ce poste caisse. La caisse ne s&apos;ouvrira qu&apos;après
          validation.
        </Typography>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {testMode ? (
          <Alert severity="info">
            Magasin 0 : mode test — les ventes ne sont pas comptabilisées dans les statistiques.
          </Alert>
        ) : null}

        <TextField
          label="URL backoffice"
          value={backofficeUrl}
          onChange={(e) => setBackofficeUrl(e.target.value)}
          fullWidth
          placeholder="https://opetitfrais.janisol.ma"
          autoComplete="off"
        />

        <TextField
          label="Token caisse"
          value={caisseToken}
          onChange={(e) => setCaisseToken(e.target.value)}
          fullWidth
          type="password"
          autoComplete="off"
        />

        <TextField
          label="Numéro magasin"
          value={magasinCode}
          onChange={(e) => setMagasinCode(e.target.value.replace(/[^\d]/g, ""))}
          fullWidth
          inputMode="numeric"
          helperText="0 = tests (hors statistiques)"
        />

        <TextField
          label="Numéro caisse"
          value={caisseCode}
          onChange={(e) => setCaisseCode(e.target.value.replace(/[^\d]/g, ""))}
          fullWidth
          inputMode="numeric"
          helperText="Doit être > 0 et unique pour ce magasin"
        />

        {status?.configPath ? (
          <Typography variant="caption" color="text.secondary">
            Fichier : {status.configPath}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5, flexDirection: "column", alignItems: "stretch", gap: 1 }}>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving}
          fullWidth
          size="large"
        >
          {saving ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={18} color="inherit" />
              Enregistrement…
            </Box>
          ) : (
            "Enregistrer et ouvrir la caisse"
          )}
        </Button>
        <Button
          color="inherit"
          onClick={() => void window.caisseApi?.quitApp()}
          disabled={saving}
          fullWidth
        >
          Quitter
        </Button>
      </DialogActions>
    </FormDialog>
  );
}
