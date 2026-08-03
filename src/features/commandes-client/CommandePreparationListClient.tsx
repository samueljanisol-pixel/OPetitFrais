"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import AppLink from "@/components/AppLink";
import { formatDh, workflowStatusLabel } from "@/features/commandes-client/workflow-labels";
import type { CommandeClientListItem } from "@/lib/commandes-client/queries";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

export default function CommandePreparationListClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandesClient.preparation");
  const tDetail = useTranslations("backoffice.commandesClient.detail");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can, linkedMagasins } = useSessionPermissions();
  const [items, setItems] = useState<CommandeClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_client.prepare")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ workflow_status: "a_preparer,en_preparation" });
      if (linkedMagasins.length === 1) params.set("magasin_id", linkedMagasins[0].id);
      const res = await fetch(`/api/commandes-client?${params}`);
      const json = (await res.json()) as { commandes?: CommandeClientListItem[]; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setItems(json.commandes ?? []);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [linkedMagasins, tCommon]);

  useEffect(() => {
    if (!permLoading && can("commandes_client.prepare")) void load();
  }, [permLoading, can, load]);

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Typography
          component={AppLink}
          href="/commandes-client"
          variant="body2"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            color: "text.secondary",
            textDecoration: "none",
            "&:hover": { color: "primary.main" },
          }}
        >
          <BackChevron fontSize="small" />
          {t("back")}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          {t("title")}
        </Typography>
        <IconButton aria-label={t("refresh")} onClick={() => void load()} disabled={loading}>
          <RefreshOutlinedIcon />
        </IconButton>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("subtitle")}
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">{t("empty")}</Typography>
        </Paper>
      ) : (
        <List component={Paper} variant="outlined">
          {items.map((c) => {
            const progress =
              c.line_count > 0 ? Math.round((c.prepared_line_count / c.line_count) * 100) : 0;
            return (
              <ListItem key={c.id} disablePadding divider>
                <ListItemButton component={AppLink} href={`/commandes-client/preparation/${c.id}`}>
                  <ListItemText
                    slotProps={{
                      primary: { component: "div" },
                      secondary: { component: "div" },
                    }}
                    primary={
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                        <Typography component="span" sx={{ fontWeight: 600 }}>
                          #{c.cart_number}
                        </Typography>
                        <Typography component="span" color="text.secondary">
                          {c.client_nom?.trim() || t("noClient")}
                        </Typography>
                        {c.magasin_code ? (
                          <Chip size="small" variant="outlined" label={c.magasin_code} />
                        ) : null}
                        <Chip
                          size="small"
                          color={c.workflow_status === "en_preparation" ? "warning" : "default"}
                          variant="outlined"
                          label={workflowStatusLabel(c.workflow_status)}
                        />
                      </Stack>
                    }
                    secondary={
                      <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatDh(c.montant_total)} DH
                          {c.fulfillment_mode === "home"
                            ? ` · ${tDetail("home")}`
                            : c.fulfillment_mode === "pickup"
                              ? ` · ${tDetail("pickup")}`
                              : ""}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{ flex: 1, height: 6, borderRadius: 1 }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72 }}>
                            {t("progressShort", { done: c.prepared_line_count, total: c.line_count })}
                          </Typography>
                        </Stack>
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}
