import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import {
  canInstallCaisseUpdate,
  checkForUpdate,
  useCaisseUpdate,
  useCaisseUpdateInstall,
} from "../lib/caisse-update";

function statusLabel(
  state: ReturnType<typeof useCaisseUpdate>,
  upToDateHint: boolean,
  installing: boolean,
): string {
  if (installing) return "Installation…";
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
  const { installing, error, runInstall } = useCaisseUpdateInstall(state);
  const [upToDateHint, setUpToDateHint] = useState(false);
  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
    };
  }, []);

  const canCheck = Boolean(window.caisseApi?.checkForUpdate);
  const canInstall = canInstallCaisseUpdate(state) && !installing;
  const suffix = statusLabel(state, upToDateHint, installing);

  const tooltip = error
    ? error
    : canInstall
      ? `Version ${state.latestVersion ?? ""} téléchargée — cliquer sur « MAJ prête » pour installer`
      : state.phase === "downloading"
        ? "Téléchargement de la mise à jour en cours"
        : state.phase === "checking"
          ? "Vérification des mises à jour…"
          : installing
            ? "Mise à jour en cours…"
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

  const startInstall = () => {
    if (!canInstallCaisseUpdate(state) || installing) return;
    void runInstall();
  };

  const handleVersionClick = () => {
    if (canInstallCaisseUpdate(state) && !installing) {
      startInstall();
      return;
    }
    if (!canCheck || state.phase === "checking" || state.phase === "downloading" || installing) return;

    void checkForUpdate().then((next) => {
      if (next.installerReady) return;
      showUpToDateHint(next);
    });
  };

  const handleInstallClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    startInstall();
  };

  const interactive =
    canInstall ||
    (canCheck && state.phase !== "checking" && state.phase !== "downloading" && !installing);

  return (
    <Tooltip title={tooltip}>
      <Box
        component={canInstall ? "button" : "div"}
        type={canInstall ? "button" : undefined}
        onClick={canInstall ? handleInstallClick : undefined}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.35,
          flex: 1,
          flexShrink: 1,
          minWidth: 0,
          flexWrap: "nowrap",
          border: 0,
          bgcolor: "transparent",
          p: 0,
          m: 0,
          cursor: canInstall ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        {canInstall || installing ? (
          <SystemUpdateAltOutlinedIcon sx={{ fontSize: 13, flexShrink: 0, color: "primary.main" }} />
        ) : null}
        <Box
          component={!canInstall && canCheck ? "button" : "span"}
          type={!canInstall && canCheck ? "button" : undefined}
          onClick={
            !canInstall && canCheck
              ? (event) => {
                  event.stopPropagation();
                  handleVersionClick();
                }
              : undefined
          }
          sx={{
            border: 0,
            bgcolor: "transparent",
            p: 0,
            m: 0,
            cursor: interactive && !canInstall ? "pointer" : "default",
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
            <Typography
              variant="caption"
              sx={{
                fontSize: 10,
                lineHeight: 1.2,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                fontWeight: canInstall || upToDateHint || installing ? 700 : 400,
                color:
                  error
                    ? "error.main"
                    : canInstall || upToDateHint || installing
                      ? "primary.main"
                      : "text.secondary",
                minWidth: 0,
              }}
            >
              {suffix}
            </Typography>
          </>
        ) : null}
      </Box>
    </Tooltip>
  );
}
