import { Box, Tooltip, Typography } from "@mui/material";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import { installCaisseUpdate, useCaisseUpdate } from "../lib/caisse-update";

function statusLabel(state: ReturnType<typeof useCaisseUpdate>): string {
  if (state.phase === "checking") return "Recherche MAJ…";
  if (state.phase === "downloading") {
    if (state.progressPercent != null) return `MAJ ${state.progressPercent}%`;
    return "MAJ…";
  }
  if (state.installerReady) return "MAJ prête";
  if (state.phase === "error") return "MAJ erreur";
  return "";
}

export default function CaisseVersionBadge() {
  const state = useCaisseUpdate();
  const suffix = statusLabel(state);
  const clickable = state.installerReady;

  const tooltip = state.installerReady
    ? `Version ${state.latestVersion ?? ""} téléchargée — cliquer pour installer et redémarrer`
    : state.phase === "downloading"
      ? "Téléchargement de la mise à jour en cours"
      : state.phase === "error" && state.error
        ? state.error
        : `Version installée ${state.currentVersion}`;

  const handleClick = () => {
    if (!clickable) return;
    void installCaisseUpdate();
  };

  return (
    <Tooltip title={tooltip}>
      <Box
        component={clickable ? "button" : "div"}
        type={clickable ? "button" : undefined}
        onClick={handleClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.35,
          flexShrink: 0,
          border: 0,
          bgcolor: "transparent",
          p: 0,
          m: 0,
          cursor: clickable ? "pointer" : "default",
          color: clickable ? "primary.main" : "text.secondary",
          minWidth: 0,
        }}
      >
        {state.installerReady ? (
          <SystemUpdateAltOutlinedIcon sx={{ fontSize: 13, flexShrink: 0 }} />
        ) : null}
        <Typography
          variant="caption"
          sx={{
            fontSize: 10,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            fontWeight: state.installerReady ? 700 : 400,
          }}
        >
          v{state.currentVersion}
          {suffix ? ` · ${suffix}` : ""}
        </Typography>
      </Box>
    </Tooltip>
  );
}
