import { useEffect, useState, type ReactNode } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import CaisseSessionGate from "./CaisseSessionGate";
import SetupDialog from "../components/SetupDialog";
import QuitConfirmDialog from "../components/QuitConfirmDialog";
import UpdateInstallConfirmDialog from "../components/UpdateInstallConfirmDialog";
import UpdateInProgressScreen from "../components/UpdateInProgressScreen";
import { invalidateCaisseConfigCache } from "../lib/hardware-config";
import { invalidateCaisseCatalogConfigCache } from "../lib/catalog";
import type { CaisseIdentityStatus } from "../lib/caisse-identity";
import {
  canInstallCaisseUpdate,
  isCaisseUpdateInstalling,
  useCaisseUpdate,
  useCaisseUpdateInstall,
} from "../lib/caisse-update";

export default function CashierGate() {
  const [loading, setLoading] = useState(true);
  const [identityReady, setIdentityReady] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<CaisseIdentityStatus | null>(null);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [startupUpdateDismissed, setStartupUpdateDismissed] = useState(false);
  const [startupUpdateOpen, setStartupUpdateOpen] = useState(false);

  const updateState = useCaisseUpdate();
  const { installing, error, runInstall, clearError } = useCaisseUpdateInstall(updateState);
  const canInstallUpdate = canInstallCaisseUpdate(updateState);
  const updateInstalling = isCaisseUpdateInstalling(updateState) || installing;
  const blockCaisseForUpdate =
    identityReady && canInstallUpdate && !startupUpdateDismissed && !updateInstalling;

  const requestQuitConfirm = () => setQuitConfirmOpen(true);

  const confirmQuit = () => {
    setQuitConfirmOpen(false);
    void window.caisseApi?.quitApp();
  };

  useEffect(() => {
    return window.caisseApi?.onRequestQuitConfirm?.(() => {
      if (updateInstalling) return;
      requestQuitConfirm();
    });
  }, [updateInstalling]);

  useEffect(() => {
    if (!identityReady || startupUpdateDismissed || !canInstallUpdate || updateInstalling) return;
    setStartupUpdateOpen(true);
  }, [identityReady, startupUpdateDismissed, canInstallUpdate, updateInstalling]);

  const refreshIdentity = async () => {
    if (!window.caisseApi?.getIdentityStatus) {
      setIdentityReady(true);
      setLoading(false);
      return;
    }

    const status = await window.caisseApi.getIdentityStatus();
    setIdentityStatus(status);
    setIdentityReady(status.complete);
    setLoading(false);

    if (status.complete) {
      await window.caisseApi.setWindowMode?.("caisse");
    } else {
      await window.caisseApi.setWindowMode?.("setup");
    }
  };

  useEffect(() => {
    void refreshIdentity();
  }, []);

  const handleSetupComplete = () => {
    invalidateCaisseConfigCache();
    invalidateCaisseCatalogConfigCache();
    void refreshIdentity();
  };

  const handleStartupUpdateDismiss = () => {
    clearError();
    setStartupUpdateOpen(false);
    setStartupUpdateDismissed(true);
  };

  const handleStartupUpdateConfirm = () => {
    setStartupUpdateOpen(false);
    // Re-vérifie le serveur avant install (via main) ; si une version plus récente
    // est détectée, le téléchargement reprend et le dialogue pourra se rouvrir.
    void runInstall().then((ok) => {
      if (ok) {
        setStartupUpdateDismissed(true);
      }
    });
  };

  let content: ReactNode;

  if (updateInstalling) {
    content = (
      <UpdateInProgressScreen
        latestVersion={updateState.latestVersion}
        currentVersion={updateState.currentVersion}
        error={error}
      />
    );
  } else if (loading) {
    content = (
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#f5f5f5",
        }}
      >
        <CircularProgress />
      </Box>
    );
  } else if (!identityReady) {
    content = (
      <Box
        sx={{
          width: "100vw",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#eceff1",
          p: 2,
        }}
      >
        <SetupDialog
          open
          status={identityStatus}
          onComplete={handleSetupComplete}
          onRequestQuit={requestQuitConfirm}
        />
      </Box>
    );
  } else if (blockCaisseForUpdate) {
    content = (
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          bgcolor: "#f5f5f5",
          px: 2,
        }}
      >
        <SystemUpdateAltOutlinedIcon sx={{ fontSize: 48, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontWeight: 700, textAlign: "center" }}>
          Mise à jour prête
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 360 }}>
          {updateState.latestVersion
            ? `La version ${updateState.latestVersion} peut être installée avant l'ouverture de la caisse.`
            : "Une mise à jour peut être installée avant l'ouverture de la caisse."}
        </Typography>
      </Box>
    );
  } else {
    content = <CaisseSessionGate onRequestQuit={requestQuitConfirm} />;
  }

  return (
    <>
      {content}
      <QuitConfirmDialog
        open={quitConfirmOpen && !updateInstalling}
        onClose={() => setQuitConfirmOpen(false)}
        onConfirm={confirmQuit}
      />
      <UpdateInstallConfirmDialog
        open={startupUpdateOpen && blockCaisseForUpdate}
        context="startup"
        dismissLabel="Plus tard"
        latestVersion={updateState.latestVersion}
        currentVersion={updateState.currentVersion}
        error={error}
        onClose={handleStartupUpdateDismiss}
        onConfirm={handleStartupUpdateConfirm}
      />
    </>
  );
}
