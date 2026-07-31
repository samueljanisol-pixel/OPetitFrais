import { useEffect, useRef, useState } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import { checkForUpdate, installCaisseUpdate, useCaisseUpdate } from "../lib/caisse-update";

function statusLabel(
  state: ReturnType<typeof useCaisseUpdate>,
  upToDateHint: boolean,
): string {
  if (upToDateHint) return "À jour";
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
  const [upToDateHint, setUpToDateHint] = useState(false);
  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
    };
  }, []);

  const suffix = statusLabel(state, upToDateHint);
  const canCheck = Boolean(window.caisseApi?.checkForUpdate);
  const canInstall = state.installerReady;

  const tooltip = canInstall
    ? `Version ${state.latestVersion ?? ""} téléchargée — cliquer sur « MAJ prête » pour installer`
    : state.phase === "downloading"
      ? "Téléchargement de la mise à jour en cours"
      : state.phase === "checking"
        ? "Vérification des mises à jour…"
        : upToDateHint
          ? "Vous avez la dernière version"
          : state.phase === "error" && state.error
            ? state.error
            : canCheck
              ? `Version ${state.currentVersion} — cliquer pour vérifier les mises à jour`
              : `Version installée ${state.currentVersion}`;

  const showUpToDateHint = (next: ReturnType<typeof useCaisseUpdate>) => {
    if (next.phase === "idle" && !next.updateAvailable && !next.error) {
      setUpToDateHint(true);
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
      upToDateTimerRef.current = setTimeout(() => setUpToDateHint(false), 3000);
    }
  };

  const handleVersionClick = () => {
    if (!canCheck || state.phase === "checking" || state.phase === "downloading") return;

    void checkForUpdate().then((next) => {
      if (next.installerReady) return;
      showUpToDateHint(next);
    });
  };

  const handleInstallClick = () => {
    if (!canInstall) return;
    void installCaisseUpdate();
  };

  return (
    <Tooltip title={tooltip}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.35,
          flex: 1,
          flexShrink: 1,
          minWidth: 0,
          flexWrap: "nowrap",
        }}
      >
        {canInstall ? (
          <SystemUpdateAltOutlinedIcon sx={{ fontSize: 13, flexShrink: 0, color: "primary.main" }} />
        ) : null}
        <Box
          component={canCheck ? "button" : "span"}
          type={canCheck ? "button" : undefined}
          onClick={handleVersionClick}
          sx={{
            border: 0,
            bgcolor: "transparent",
            p: 0,
            m: 0,
            cursor: canCheck && state.phase !== "checking" && state.phase !== "downloading" ? "pointer" : "default",
            color: "text.secondary",
            minWidth: 0,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: 10,
              lineHeight: 1.2,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              fontWeight: 400,
            }}
          >
            v{state.currentVersion}
          </Typography>
        </Box>
        {suffix ? (
          <>
            <Typography
              component="span"
              variant="caption"
              sx={{ fontSize: 10, lineHeight: 1.2, color: "text.secondary" }}
            >
              ·
            </Typography>
            <Box
              component={canInstall ? "button" : "span"}
              type={canInstall ? "button" : undefined}
              onClick={handleInstallClick}
              sx={{
                border: 0,
                bgcolor: "transparent",
                p: 0,
                m: 0,
                cursor: canInstall ? "pointer" : "default",
                color: canInstall || upToDateHint ? "primary.main" : "text.secondary",
                minWidth: 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: 10,
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  fontWeight: canInstall || upToDateHint ? 700 : 400,
                }}
              >
                {suffix}
              </Typography>
            </Box>
          </>
        ) : null}
      </Box>
    </Tooltip>
  );
}
