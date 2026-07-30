import { Box, Tooltip, Typography } from "@mui/material";
import {
  formatCashierClock,
  useApiServerStatus,
  useClock,
  useInternetStatus,
  useSaurusScaleStatus,
} from "../lib/status-bar";

type Props = {
  backofficeUrl: string | null;
};

function StatusDot({
  ok,
  label,
  okTooltip,
  koTooltip,
}: {
  ok: boolean;
  label: string;
  okTooltip: string;
  koTooltip: string;
}) {
  return (
    <Tooltip title={ok ? okTooltip : koTooltip}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        <Box
          sx={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: ok ? "#269641" : "#c62828",
            boxShadow: ok ? "0 0 0 1px rgba(38,150,65,0.25)" : "0 0 0 1px rgba(198,40,40,0.25)",
          }}
        />
        <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.2, color: "text.secondary" }}>
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export default function CashierStatusBar({ backofficeUrl }: Props) {
  const internetOk = useInternetStatus();
  const apiOk = useApiServerStatus(backofficeUrl);
  const saurus = useSaurusScaleStatus();
  const now = useClock();

  const saurusOk = saurus.connected;

  return (
    <Box
      sx={{
        px: 0,
        py: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 1.25,
        flexShrink: 0,
      }}
    >
      <StatusDot
        ok={internetOk}
        label={internetOk ? "Internet" : "Hors ligne"}
        okTooltip="Connexion internet OK"
        koTooltip="Pas de connexion internet"
      />
      <StatusDot
        ok={apiOk}
        label={apiOk ? "Serveur" : "Serveur HS"}
        okTooltip="Serveur API backoffice accessible"
        koTooltip="Serveur API backoffice inaccessible"
      />
      <StatusDot
        ok={saurusOk}
        label={saurusOk ? "SAURUS" : "SAURUS HS"}
        okTooltip="Balance SAURUS connectée"
        koTooltip={
          saurus.configured
            ? "Balance SAURUS inaccessible"
            : "IP balance SAURUS non configurée (Paramètres)"
        }
      />
      <Typography
        variant="caption"
        sx={{
          fontSize: 10,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
          color: "text.secondary",
          textAlign: "left",
          whiteSpace: "nowrap",
        }}
      >
        {formatCashierClock(now)}
      </Typography>
    </Box>
  );
}
