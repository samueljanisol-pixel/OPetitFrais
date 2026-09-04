import { Box, Tooltip, Typography } from "@mui/material";
import {
  useApiServerStatus,
  useInternetStatus,
  useSaurusScaleStatus,
  useSupabaseQueueCount,
} from "../lib/status-bar";
import CaisseVersionBadge from "./CaisseVersionBadge";

type Props = {
  backofficeUrl: string | null;
  /** Mode hors ligne (serveur API inaccessible). */
  offlineMode?: boolean;
  offlineCatalogDate?: string | null;
  /** Dernière actualisation du catalogue / prix (libellé déjà formaté). */
  pricesUpdatedLabel?: string | null;
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

export default function CashierStatusBar({
  backofficeUrl,
  offlineMode = false,
  offlineCatalogDate = null,
  pricesUpdatedLabel = null,
}: Props) {
  const internetOk = useInternetStatus();
  const apiOk = useApiServerStatus(backofficeUrl);
  const saurus = useSaurusScaleStatus();
  const pendingSend = useSupabaseQueueCount();

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
        {pendingSend > 0 ? (
          <Tooltip title="Ventes ou clôtures en attente d’envoi vers le serveur">
            <Typography
              variant="caption"
              sx={{ fontSize: 10, lineHeight: 1.2, fontWeight: 800, color: "#b26a00" }}
            >
              {pendingSend} en attente d’envoi
            </Typography>
          </Tooltip>
        ) : null}
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
        <Box sx={{ flex: 1, minWidth: 0, pr: 0.5, display: "flex", flexDirection: "column", gap: 0.15 }}>
          <CaisseVersionBadge />
          {pricesUpdatedLabel ? (
            <Tooltip title="Dernière mise à jour du catalogue / prix">
              <Typography
                variant="caption"
                sx={{
                  fontSize: 10,
                  lineHeight: 1.15,
                  fontWeight: 600,
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Prix : {pricesUpdatedLabel}
              </Typography>
            </Tooltip>
          ) : null}
        </Box>
        {offlineMode ? (
          <Tooltip
            title={
              offlineCatalogDate
                ? `Catalogue local du ${offlineCatalogDate}. Ventes et tickets OK ; commandes boutique indisponibles.`
                : "Serveur inaccessible. Ventes et tickets locaux OK."
            }
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.2,
                color: "#b26a00",
                textAlign: "right",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Mode hors ligne
            </Typography>
          </Tooltip>
        ) : null}
      </Box>
    </Box>
  );
}
