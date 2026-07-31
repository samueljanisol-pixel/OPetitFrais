import { useEffect, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import CashierScreen from "./CashierScreen";
import SetupDialog from "../components/SetupDialog";
import QuitConfirmDialog from "../components/QuitConfirmDialog";
import { invalidateCaisseConfigCache } from "../lib/hardware-config";
import { invalidateCaisseCatalogConfigCache } from "../lib/catalog";
import type { CaisseIdentityStatus } from "../lib/caisse-identity";

export default function CashierGate() {
  const [loading, setLoading] = useState(true);
  const [identityReady, setIdentityReady] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<CaisseIdentityStatus | null>(null);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  const requestQuitConfirm = () => setQuitConfirmOpen(true);

  const confirmQuit = () => {
    setQuitConfirmOpen(false);
    void window.caisseApi?.quitApp();
  };

  useEffect(() => {
    return window.caisseApi?.onRequestQuitConfirm?.(requestQuitConfirm);
  }, []);

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

  let content: React.ReactNode;

  if (loading) {
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
  } else {
    content = <CashierScreen onRequestQuit={requestQuitConfirm} />;
  }

  return (
    <>
      {content}
      <QuitConfirmDialog
        open={quitConfirmOpen}
        onClose={() => setQuitConfirmOpen(false)}
        onConfirm={confirmQuit}
      />
    </>
  );
}
