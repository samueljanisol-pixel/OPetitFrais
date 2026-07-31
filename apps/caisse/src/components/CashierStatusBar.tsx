import { Box, Tooltip, Typography } from "@mui/material";
import {
  formatCashierClock,
  useApiServerStatus,
  useClock,
  useInternetStatus,
  useSaurusScaleStatus,
} from "../lib/status-bar";
import CaisseVersionBadge from "./CaisseVersionBadge";

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
        display: "flex",
        flexDirection: "column",
        gap: 0.45,
        flexShrink: 0,
        minWidth: 0,
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.25,
          flexWrap: "wrap",
          rowGap: 0.25,
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
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.25,
          minWidth: 0,
          width: "100%",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, pr: 0.5 }}>
          <CaisseVersionBadge />
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
            color: "text.primary",
            textAlign: "right",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {formatCashierClock(now)}
        </Typography>
      </Box>
    </Box>
  );
}
