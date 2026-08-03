"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import ClientFormDialog from "@/features/clients/ClientFormDialog";
import ClientPanierLinkDialog from "@/features/clients/ClientPanierLinkDialog";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type ClientSummary = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  total: number;
  paye: number;
  reste: number;
};

type UnlinkedPanier = {
  id: string;
  cart_number: number;
  label: string;
  montant_total: number;
  submitted_at: string | null;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ClientsListClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.clients.list");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can, canReadCommandesClient } = useSessionPermissions();

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedPanier[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkPanier, setLinkPanier] = useState<UnlinkedPanier | null>(null);

  useEffect(() => {
    if (!permLoading && !can("clients.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [clientsRes, unlinkedRes] = await Promise.all([
        fetch("/api/clients"),
        fetch("/api/clients/paniers-boutique"),
      ]);
      const clientsJson = (await clientsRes.json()) as {
        clients?: ClientSummary[];
        error?: string;
      };
      const unlinkedJson = (await unlinkedRes.json()) as {
        paniers?: UnlinkedPanier[];
        error?: string;
      };
      if (!clientsRes.ok) {
        setErr(typeof clientsJson.error === "string" ? clientsJson.error : tCommon("error"));
        setClients([]);
      } else {
        setClients(clientsJson.clients ?? []);
      }
      if (unlinkedRes.ok) {
        setUnlinked(unlinkedJson.paniers ?? []);
      } else {
        setUnlinked([]);
      }
    } catch {
      setErr(tCommon("networkError"));
      setClients([]);
      setUnlinked([]);
    } finally {
      setLoading(false);
    }
  }, [tCommon]);

  useEffect(() => {
    if (permLoading || !can("clients.read")) return;
    void load();
  }, [permLoading, can, load]);

  if (permLoading || !can("clients.read")) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-slate-600">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Button
        component={AppLink}
        href="/"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {tCommon("home")}
      </Button>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, flex: 1 }}>
          {t("title")}
        </Typography>
        {can("clients.write") ? (
          <Button variant="contained" color="success" onClick={() => setCreateOpen(true)} sx={{ textTransform: "none" }}>
            {t("addClient")}
          </Button>
        ) : null}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("subtitle")}
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={32} />
        </Box>
      ) : (
        <>
          {unlinked.length > 0 ? (
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {t("unlinkedTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t("unlinkedHint")}
              </Typography>
              <List disablePadding>
                {unlinked.map((p) => (
                  <ListItem key={p.id} disablePadding sx={{ mb: 1 }}>
                    <Paper variant="outlined" sx={{ width: "100%", p: 1.5 }}>
                      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }}>{p.label}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {formatDh(p.montant_total)} DH
                          </Typography>
                        </Box>
                        {canReadCommandesClient ? (
                          <Button
                            size="small"
                            variant="text"
                            component={AppLink}
                            href={`/commandes-client/${encodeURIComponent(p.id)}`}
                            sx={{ textTransform: "none" }}
                          >
                            Commandes client
                          </Button>
                        ) : null}
                        {can("clients.write") ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setLinkPanier(p)}
                            sx={{ textTransform: "none" }}
                          >
                            {t("linkToClient")}
                          </Button>
                        ) : null}
                      </Box>
                    </Paper>
                  </ListItem>
                ))}
              </List>
            </Paper>
          ) : null}

          <List disablePadding>
            {clients.map((c) => (
              <ListItem key={c.id} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  component={AppLink}
                  href={`/clients/${encodeURIComponent(c.id)}`}
                  sx={{
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: c.reste > 0 ? "warning.light" : "divider",
                    bgcolor: c.reste > 0 ? "warning.50" : "background.paper",
                    py: 1.25,
                  }}
                >
                  <ListItemText
                    primary={c.name}
                    secondary={
                      <>
                        {c.phone ? `${c.phone} · ` : ""}
                        {t("reste")} : {formatDh(c.reste)} DH
                        {c.total > 0 ? ` / ${formatDh(c.total)} DH` : ""}
                      </>
                    }
                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {clients.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                {t("empty")}
              </Typography>
            ) : null}
          </List>
        </>
      )}

      <ClientFormDialog
        open={createOpen}
        client={null}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          void load();
        }}
      />

      <ClientPanierLinkDialog
        open={linkPanier != null}
        panierId={linkPanier?.id ?? null}
        panierLabel={linkPanier?.label ?? null}
        onClose={() => setLinkPanier(null)}
        onSaved={() => {
          setLinkPanier(null);
          void load();
        }}
      />
    </main>
  );
}
