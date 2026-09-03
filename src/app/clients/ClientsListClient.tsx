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
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import ClientFormDialog from "@/features/clients/ClientFormDialog";
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
  const { loading: permLoading, can } = useSessionPermissions();

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!permLoading && !can("clients.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const clientsRes = await fetch("/api/clients");
      const clientsJson = (await clientsRes.json()) as {
        clients?: ClientSummary[];
        error?: string;
      };
      if (!clientsRes.ok) {
        setErr(typeof clientsJson.error === "string" ? clientsJson.error : tCommon("error"));
        setClients([]);
      } else {
        setClients(clientsJson.clients ?? []);
      }
    } catch {
      setErr(tCommon("networkError"));
      setClients([]);
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
    </main>
  );
}
