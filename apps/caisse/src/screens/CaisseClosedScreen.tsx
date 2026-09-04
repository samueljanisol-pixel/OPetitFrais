import { useEffect, useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import type { CaisseCaissierPublic, CaisseSessionPublic } from "../../electron/preload/index";
import { formatCaissierDisplayName } from "../../shared/caisse-session";
import logoOpetitFrais from "../assets/logo-opetit-frais.png";
import RoundNumpad from "../components/RoundNumpad";
import SettingsDialog from "../components/SettingsDialog";
import { formatCashierClock, formatMagasinCaisseLabel, useClock, useSupabaseQueueCount } from "../lib/status-bar";

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"] as const;
const CAISSIERS_REFRESH_MS = 5 * 60 * 1000;

type Props = {
  session: CaisseSessionPublic;
  magasinCode: string;
  caisseCode: string;
  onSessionChange: (session: CaisseSessionPublic) => void;
  onRequestQuit: () => void;
};

export default function CaisseClosedScreen({
  session,
  magasinCode,
  caisseCode,
  onSessionChange,
  onRequestQuit,
}: Props) {
  const locked = session.status === "locked";
  const clockNow = useClock();
  const pendingSend = useSupabaseQueueCount();
  const [caissiers, setCaissiers] = useState<CaisseCaissierPublic[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    locked ? session.caissierId : null,
  );
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadCaissiers = async (force = false) => {
    if (!window.caisseApi?.getCaissiers) {
      setListError("API caisse indisponible");
      return;
    }
    const payload = force
      ? await window.caisseApi.refreshCaissiersCache()
      : await window.caisseApi.getCaissiers();
    setCaissiers(payload.caissiers);
    if (payload.caissiers.length === 0) {
      setListError(payload.error ?? "Aucun caissier en cache — connectez la caisse une fois");
    } else {
      setListError(payload.error);
    }
  };

  useEffect(() => {
    void loadCaissiers(true);
    const id = window.setInterval(() => {
      void loadCaissiers(true);
    }, CAISSIERS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (locked) {
      setSelectedId(session.caissierId);
    }
  }, [locked, session.caissierId]);

  const handleKey = (key: string) => {
    setError(null);
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "←") {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (/^\d$/.test(key) && pin.length < 8) {
      setPin((prev) => prev + key);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!locked && !selectedId) {
      setError("Choisissez un caissier");
      return;
    }
    if (pin.length < 4) {
      setError("Saisissez le code (4 à 8 chiffres)");
      return;
    }
    if (!window.caisseApi) {
      setError("API caisse indisponible");
      return;
    }

    setBusy(true);
    setError(null);
    const result = locked
      ? await window.caisseApi.unlockSession({ pin })
      : await window.caisseApi.openSession({ userId: selectedId ?? "", pin });
    setBusy(false);
    setPin("");
    if (!result.ok) {
      setError(result.error);
      if (result.error.includes("déjà ouverte") && window.caisseApi.getSession) {
        const current = await window.caisseApi.getSession();
        if (current.status !== "closed") onSessionChange(current);
      }
      return;
    }
    onSessionChange(result.session);
  };

  const selected = locked
    ? { userId: session.caissierId ?? "", prenom: "", nom: session.caissierName ?? "" }
    : caissiers.find((c) => c.userId === selectedId) ?? null;

  return (
    <Box
      sx={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        bgcolor: "#eceff1",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 3,
        py: 2,
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="outlined"
          startIcon={<SettingsOutlinedIcon />}
          onClick={() => setSettingsOpen(true)}
          sx={{ fontWeight: 700, bgcolor: "#fff" }}
        >
          Paramètres
        </Button>
        <IconButton
          aria-label="Fermer la caisse"
          onClick={onRequestQuit}
          sx={{
            width: 56,
            height: 56,
            bgcolor: "#fff",
            border: 1,
            borderColor: "divider",
            "&:hover": { bgcolor: "#fce4ec" },
          }}
        >
          <PowerSettingsNewIcon sx={{ fontSize: 32 }} />
        </IconButton>
      </Box>
      <Box component="img" src={logoOpetitFrais} alt="O'petit frais" sx={{ height: 72, mb: 0.5 }} />
      <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
        {formatMagasinCaisseLabel(magasinCode, caisseCode)}
      </Typography>
      <Typography sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary", mb: pendingSend > 0 ? 0.5 : 1.5 }}>
        {formatCashierClock(clockNow)}
      </Typography>
      {pendingSend > 0 ? (
        <Typography sx={{ color: "#b26a00", fontWeight: 700, fontSize: 13, mb: 1.5 }}>
          {pendingSend} en attente d’envoi
        </Typography>
      ) : null}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 800,
          mb: 2,
          color: locked ? "warning.dark" : "text.primary",
          textTransform: "uppercase",
        }}
      >
        {locked ? "Caisse verrouillée" : "Caisse fermée"}
      </Typography>

      <Box
        sx={{
          display: "flex",
          gap: 3,
          width: "100%",
          maxWidth: 880,
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            bgcolor: "#fff",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            overflow: "hidden",
          }}
        >
          <Typography sx={{ px: 1.5, py: 1, fontWeight: 800 }}>Caissier</Typography>
          <Box sx={{ flex: 1, overflow: "auto", px: 1, pb: 1 }}>
            {locked ? (
              <Button fullWidth variant="contained" disabled sx={{ justifyContent: "flex-start", py: 1.5, mb: 1 }}>
                {session.caissierName ?? "Caissier"}
              </Button>
            ) : (
              caissiers.map((c) => {
                const name = formatCaissierDisplayName(c.prenom, c.nom) || c.userId;
                const active = selectedId === c.userId;
                return (
                  <Button
                    key={c.userId}
                    fullWidth
                    variant={active ? "contained" : "outlined"}
                    onClick={() => {
                      setSelectedId(c.userId);
                      setError(null);
                    }}
                    sx={{ justifyContent: "flex-start", py: 1.35, mb: 1, fontWeight: 700 }}
                  >
                    {name}
                  </Button>
                );
              })
            )}
            {listError ? (
              <Typography color="error" variant="body2" sx={{ px: 0.5 }}>
                {listError}
              </Typography>
            ) : null}
          </Box>
        </Box>

        <Box
          sx={{
            width: 220,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            bgcolor: "#fff",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            px: 1.25,
            py: 1,
          }}
        >
          <Typography sx={{ fontWeight: 700, mb: 0.25, fontSize: 14, textAlign: "center" }}>
            {selected
              ? locked
                ? session.caissierName
                : formatCaissierDisplayName(selected.prenom, selected.nom)
              : "Code"}
          </Typography>
          <Typography
            sx={{
              fontSize: 22,
              letterSpacing: 5,
              fontWeight: 800,
              minHeight: 32,
              mb: 0.75,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pin.length > 0 ? "•".repeat(pin.length) : " "}
          </Typography>
          <RoundNumpad keys={PIN_KEYS} onKey={handleKey} keySize={44} disabled={busy} />
          {error ? (
            <Typography color="error" variant="body2" sx={{ mt: 0.75, textAlign: "center" }}>
              {error}
            </Typography>
          ) : null}
          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={busy}
            onClick={() => void submit()}
            sx={{ mt: 1, py: 1.15, fontWeight: 800 }}
          >
            {busy ? "Vérification…" : locked ? "Déverrouiller" : "Ouvrir Caisse"}
          </Button>
        </Box>
      </Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Box>
  );
}
