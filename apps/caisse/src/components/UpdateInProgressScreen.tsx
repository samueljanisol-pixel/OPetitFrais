import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";

type Props = {
  latestVersion: string | null;
  currentVersion: string | null;
  error?: string | null;
};

export default function UpdateInProgressScreen({ latestVersion, currentVersion, error }: Props) {
  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        bgcolor: "#f5f5f5",
        px: 3,
      }}
    >
      <SystemUpdateAltOutlinedIcon sx={{ fontSize: 56, color: "primary.main" }} />
      <Typography variant="h5" sx={{ fontWeight: 800, textAlign: "center" }}>
        Mise à jour en cours
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: "center", maxWidth: 460 }}>
        {latestVersion && currentVersion
          ? `Installation de la version ${latestVersion} (actuellement ${currentVersion}).`
          : latestVersion
            ? `Installation de la version ${latestVersion}.`
            : "Installation de la mise à jour."}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 460 }}>
        Une fenêtre de progression va s&apos;ouvrir (aucune validation requise).
        La caisse se ferme pour permettre la mise à jour, puis se relance automatiquement.
      </Typography>
      {!error ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary">
            Ouverture de l&apos;installateur…
          </Typography>
        </Box>
      ) : (
        <Alert severity="error" sx={{ maxWidth: 420, width: "100%" }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
