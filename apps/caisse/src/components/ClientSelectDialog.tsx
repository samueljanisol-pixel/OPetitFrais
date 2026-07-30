import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import type { CaisseClient } from "@opf/caisse-core";
import { formatMoneyFr } from "@opf/caisse-core";
import ClientFormDialog from "./ClientFormDialog";
import { fetchClientsFromApi } from "../lib/clients";

type Props = {
  open: boolean;
  selectedClientId: string | null;
  onClose: () => void;
  onValidate: (client: { id: string | null; name: string | null }) => void;
};

export default function ClientSelectDialog({
  open,
  selectedClientId,
  onClose,
  onValidate,
}: Props) {
  const [clients, setClients] = useState<CaisseClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(selectedClientId);
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<CaisseClient | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchClientsFromApi();
    setClients(result.clients);
    if (result.error) setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPickedId(selectedClientId);
    void loadClients();
  }, [open, selectedClientId, loadClients]);

  const pickedClient = useMemo(
    () => clients.find((c) => c.id === pickedId) ?? null,
    [clients, pickedId],
  );

  const title = pickedClient ? pickedClient.name : "Pas de client choisi";

  const handleSaved = (client: CaisseClient) => {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === client.id);
      if (idx < 0) return [...prev, client].sort(sortClients);
      const next = prev.slice();
      next[idx] = client;
      return next.sort(sortClients);
    });
    setPickedId(client.id);
  };

  const openCreate = () => {
    setEditClient(null);
    setFormOpen(true);
  };

  const openEdit = (client: CaisseClient, e: MouseEvent) => {
    e.stopPropagation();
    setEditClient(client);
    setFormOpen(true);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="lg"
        slotProps={{ paper: { sx: { minHeight: "80vh" } } }}
      >
        <DialogTitle sx={{ textAlign: "center", fontSize: 22 }}>{title}</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : null}

          {error ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper
                elevation={pickedId === null ? 4 : 1}
                onClick={() => setPickedId(null)}
                sx={{
                  p: 1.5,
                  minHeight: 88,
                  cursor: "pointer",
                  border: pickedId === null ? 2 : 1,
                  borderColor: pickedId === null ? "primary.main" : "divider",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <PersonOffOutlinedIcon color="action" sx={{ mb: 0.5 }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Pas de client
                </Typography>
              </Paper>
            </Grid>

            {clients.map((client) => (
              <Grid key={client.id} size={{ xs: 6, sm: 4, md: 3 }}>
                <Paper
                  elevation={pickedId === client.id ? 4 : 1}
                  onClick={() => setPickedId(client.id)}
                  sx={{
                    p: 1.5,
                    minHeight: 88,
                    cursor: "pointer",
                    border: pickedId === client.id ? 2 : 1,
                    borderColor: pickedId === client.id ? "primary.main" : "divider",
                    position: "relative",
                  }}
                >
                  <IconButton
                    size="small"
                    sx={{ position: "absolute", top: 4, right: 4 }}
                    onClick={(e) => openEdit(client, e)}
                    aria-label="Modifier"
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <PersonOutlineOutlinedIcon color="primary" sx={{ mb: 0.5 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, pr: 3 }}>
                    {client.name}
                  </Typography>
                  {client.balanceDue > 0 ? (
                    <Typography variant="caption" color="error.main">
                      Reste : {formatMoneyFr(client.balanceDue)} DH
                    </Typography>
                  ) : null}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="outlined" onClick={openCreate}>
            Nouveau
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pickedId === null) {
                onValidate({ id: null, name: null });
              } else if (pickedClient) {
                onValidate({ id: pickedClient.id, name: pickedClient.name });
              }
              onClose();
            }}
          >
            Valider
          </Button>
        </DialogActions>
      </Dialog>

      <ClientFormDialog
        open={formOpen}
        client={editClient}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}

function sortClients(a: CaisseClient, b: CaisseClient): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, "fr");
}
