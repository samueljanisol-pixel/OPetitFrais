"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import {
  formatDh,
  LIST_FILTERS,
  displayCommandeTotal,
  workflowStatusLabel,
} from "@/features/commandes-client/workflow-labels";
import type { CommandeClientListItem } from "@/lib/commandes-client/queries";
import type { WorkflowStatus } from "@/lib/commandes-client/workflow";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

export default function CommandesClientListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("backoffice.commandesClient.list");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { formatDateTime } = useAppFormat();
  const { loading: permLoading, can, linkedMagasins } = useSessionPermissions();

  const filterKey = searchParams.get("filter") ?? "all";
  const tabIndex = Math.max(0, LIST_FILTERS.findIndex((f) => f.key === filterKey));

  const [commandes, setCommandes] = useState<CommandeClientListItem[]>([]);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_client.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const filter = LIST_FILTERS.find((f) => f.key === filterKey) ?? LIST_FILTERS[0];
      const params = new URLSearchParams();
      if (filter.statuses) {
        params.set("workflow_status", filter.statuses.join(","));
      } else if (filterKey === "annulees") {
        params.set("workflow_status", "annulee");
      } else if (filterKey !== "all") {
        params.set("include_cancelled", "0");
      }
      if (linkedMagasins.length === 1) {
        params.set("magasin_id", linkedMagasins[0].id);
      }
      const res = await fetch(`/api/commandes-client?${params.toString()}`);
      const json = (await res.json()) as {
        commandes?: CommandeClientListItem[];
        counts?: Record<string, number>;
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        setCommandes([]);
        setFilterCounts({});
        return;
      }
      setCommandes(json.commandes ?? []);
      setFilterCounts(json.counts ?? {});
    } catch {
      setErr(tCommon("networkError"));
      setCommandes([]);
      setFilterCounts({});
    } finally {
      setLoading(false);
    }
  }, [filterKey, linkedMagasins, tCommon]);

  useEffect(() => {
    if (!permLoading && can("commandes_client.read")) void load();
  }, [permLoading, can, load]);

  const handleTab = (_: unknown, idx: number) => {
    const key = LIST_FILTERS[idx]?.key ?? "all";
    router.push(`/commandes-client?filter=${key}`);
  };

  const subtitle = useMemo(() => t("subtitle"), [t]);

  if (permLoading || !can("commandes_client.read")) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", p: 2 }}>
      <Button component={AppLink} href="/" startIcon={<BackChevron />} sx={{ mb: 1 }}>
        {tCommon("home")}
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {subtitle}
      </Typography>

      {can("commandes_client.prepare") || can("commandes_client.deliver") ? (
        <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          {can("commandes_client.prepare") ? (
            <Button component={AppLink} href="/commandes-client/preparation" variant="contained" size="small">
              {t("preparationLink")}
            </Button>
          ) : null}
          {can("commandes_client.deliver") ? (
            <>
              <Button component={AppLink} href="/commandes-client/livraison" variant="outlined" size="small">
                {t("livraisonLink")}
              </Button>
              <Button component={AppLink} href="/commandes-client/retrait" variant="outlined" size="small">
                {t("retraitLink")}
              </Button>
            </>
          ) : null}
        </Box>
      ) : null}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabIndex} onChange={handleTab} variant="scrollable" scrollButtons="auto">
          {LIST_FILTERS.map((f) => {
            const count = filterCounts[f.key] ?? 0;
            const label = t(`filters.${f.key}`);
            return (
              <Tab
                key={f.key}
                label={
                  f.key === "all" ? (
                    label
                  ) : (
                    <Badge
                      badgeContent={count}
                      color="primary"
                      max={99}
                      invisible={count === 0}
                      sx={{
                        "& .MuiBadge-badge": {
                          fontSize: "0.65rem",
                          height: 18,
                          minWidth: 18,
                          padding: "0 4px",
                        },
                      }}
                    >
                      <Box component="span" sx={{ pr: count > 0 ? 1.25 : 0 }}>
                        {label}
                      </Box>
                    </Badge>
                  )
                }
              />
            );
          })}
        </Tabs>
      </Paper>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : commandes.length === 0 ? (
        <Typography color="text.secondary">{t("empty")}</Typography>
      ) : (
        <List component={Paper}>
          {commandes.map((c) => (
            <ListItem key={c.id} disablePadding divider>
              <ListItemButton component={AppLink} href={`/commandes-client/${c.id}`} sx={{ py: 1.5 }}>
                <Box sx={{ width: "100%" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 600 }}>#{c.cart_number}</Typography>
                    <Chip size="small" label={workflowStatusLabel(c.workflow_status)} />
                    {c.payment_status === "paid" ? (
                      <Chip size="small" color="success" label={t("paid")} />
                    ) : null}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ display: "block" }}>
                    {c.submitted_at ? formatDateTime(c.submitted_at) : "—"} ·{" "}
                    {c.client_nom ?? t("noClient")}
                    {c.magasin_nom ? ` · ${c.magasin_nom}` : ""}
                  </Typography>
                  <Typography variant="body2" sx={{ display: "block", fontWeight: 700, mt: 0.25 }}>
                    {formatDh(displayCommandeTotal(c))} DH
                  </Typography>
                </Box>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

    </Box>
  );
}
