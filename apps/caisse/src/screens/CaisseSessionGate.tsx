import { useEffect, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import type { CaisseSessionPublic } from "../../electron/preload/index";
import { emptyClosedSession } from "../../shared/caisse-session";
import CashierScreen from "./CashierScreen";
import CaisseClosedScreen from "./CaisseClosedScreen";

type Props = {
  onRequestQuit: () => void;
};

const DEV_OPEN_SESSION: CaisseSessionPublic = {
  status: "open",
  clotureNumber: 1,
  clotureRef: "M00C01CL1",
  caissierId: "dev",
  caissierName: "Dev",
  openedAt: new Date().toISOString(),
  cardTicketCount: 0,
};

export default function CaisseSessionGate({ onRequestQuit }: Props) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CaisseSessionPublic>(emptyClosedSession());
  const [magasinCode, setMagasinCode] = useState("");
  const [caisseCode, setCaisseCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.caisseApi?.getSession) {
        if (!cancelled) {
          setSession(DEV_OPEN_SESSION);
          setLoading(false);
        }
        return;
      }
      const [s, config] = await Promise.all([
        window.caisseApi.getSession(),
        window.caisseApi.getConfig(),
      ]);
      if (cancelled) return;
      setSession(s);
      setMagasinCode(config.magasinCode);
      setCaisseCode(config.caisseCode);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
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
  }

  if (session.status !== "open") {
    return (
      <CaisseClosedScreen
        session={session}
        magasinCode={magasinCode}
        caisseCode={caisseCode}
        onSessionChange={setSession}
      />
    );
  }

  return (
    <CashierScreen
      session={session}
      onRequestQuit={onRequestQuit}
      onLock={async () => {
        if (!window.caisseApi?.lockSession) return;
        const result = await window.caisseApi.lockSession();
        if (result.ok) setSession(result.session);
      }}
      onSessionClosed={(next) => {
        setSession(next);
      }}
    />
  );
}
