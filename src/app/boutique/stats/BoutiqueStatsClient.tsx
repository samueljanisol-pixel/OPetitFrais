"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import BackNavButton from "@/components/BackNavButton";
import CaJourHistogram from "@/components/CaJourHistogram";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import {
  SHOP_ACTIVE_CART_MINUTES,
  SHOP_ACTIVE_VISITOR_MINUTES,
} from "@/lib/shop/analytics-constants";
import type { ShopAnalyticsDashboard } from "@/lib/shop/analytics-server";
import { shopPublicUrl } from "@/lib/shop/hosts";
import { useAppFormat } from "@/lib/i18n/useAppFormat";

const REFRESH_MS = 60_000;

export default function BoutiqueStatsClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.shopStats");
  const tCommon = useTranslations("common");
  const { formatNumber } = useAppFormat();
  const { loading: permLoading, canReadShop } = useSessionPermissions();

  const [data, setData] = useState<ShopAnalyticsDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permLoading && !canReadShop) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canReadShop, router]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/shop/analytics/dashboard?days=30", { credentials: "include" });
      const json = (await res.json()) as { data?: ShopAnalyticsDashboard; error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        setData(null);
        return;
      }
      setData(json.data ?? null);
    } catch {
      setErr(tCommon("error"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tCommon]);

  useEffect(() => {
    if (permLoading || !canReadShop) return;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [permLoading, canReadShop, load]);

  const chartPoints = useMemo(
    () =>
      (data?.visitsByDay ?? []).map((row) => ({
        date: row.date,
        total: row.visitCount,
      })),
    [data?.visitsByDay],
  );

  if (permLoading || (!canReadShop && loading)) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">{tCommon("loading")}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100%",
        background: "linear-gradient(to bottom right, #ecfdf5, #fff, #fff1f2)",
        px: { xs: 2, sm: 3 },
        py: { xs: 2, sm: 3 },
      }}
    >
      <Stack spacing={2.5} sx={{ maxWidth: 960, mx: "auto" }}>
        <BackNavButton href="/">{t("backHome")}</BackNavButton>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 1.5,
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {t("title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("subtitle")}
            </Typography>
          </Box>
          <Button
            component="a"
            href={shopPublicUrl("/")}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            color="success"
            startIcon={<OpenInNewIcon />}
            sx={{ textTransform: "none", alignSelf: { xs: "stretch", sm: "center" } }}
          >
            {t("openSite")}
          </Button>
        </Box>

        {err ? (
          <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "error.light" }}>
            <Typography color="error">{err}</Typography>
          </Paper>
        ) : null}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          <StatCard
            label={t("todayVisits")}
            value={loading && !data ? "…" : formatNumber(data?.todayVisits ?? 0)}
            hint={t("todayVisitsHint")}
          />
          <StatCard
            label={t("activeVisitors")}
            value={loading && !data ? "…" : formatNumber(data?.activeVisitors ?? 0)}
            hint={t("activeVisitorsHint", { minutes: SHOP_ACTIVE_VISITOR_MINUTES })}
          />
          <StatCard
            label={t("activeCarts")}
            value={loading && !data ? "…" : formatNumber(data?.activeCarts ?? 0)}
            hint={t("activeCartsHint", { minutes: SHOP_ACTIVE_CART_MINUTES })}
          />
        </Box>

        {chartPoints.length > 0 ? (
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: 1, borderColor: "divider" }}>
            <CaJourHistogram points={chartPoints} metric="qty" title={t("visitsChartTitle")} />
          </Paper>
        ) : null}

        <Typography variant="caption" color="text.secondary">
          {t("refreshHint", { seconds: REFRESH_MS / 1000 })}
        </Typography>
      </Stack>
    </Box>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: 1,
        borderColor: "divider",
        bgcolor: "rgba(255,255,255,0.9)",
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {hint}
      </Typography>
    </Paper>
  );
}
