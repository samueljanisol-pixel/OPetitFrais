"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import AppLink from "@/components/AppLink";
import BackNavButton from "@/components/BackNavButton";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadDistinctJournalDates, loadJournalEntriesForDate } from "@/lib/cuisine/journal-queries";
import {
  formatJournalDateChip,
  formatJournalDateLabelCompact,
  shiftJournalDateIso,
  todayJournalDateIso,
} from "@/lib/cuisine/production-date";
import { aggregateDayTotals } from "@/lib/cuisine/aggregate-day-totals";
import { aggregateProductTotalsBySubcategory } from "@/lib/cuisine/aggregate-product-totals";
import {
  loadProductSalesQtyForDate,
  mergeProductGroupsWithSales,
} from "@/lib/cuisine/load-product-sales-for-date";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import type { CuisineJournalEntryWithProduct } from "@/lib/cuisine/types";
import CuisineHistoriqueTotalsTable from "./CuisineHistoriqueTotalsTable";

export default function CuisineHistoriqueClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.cuisine.historique");
  const tCommon = useTranslations("common");
  const { locale, formatNumber } = useAppFormat();
  const { loading: permLoading, canCuisineHistorique, canCuisineSaisie } = useSessionPermissions();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const todayIso = useMemo(() => todayJournalDateIso(), []);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [knownDates, setKnownDates] = useState<string[]>([]);
  const [entries, setEntries] = useState<CuisineJournalEntryWithProduct[]>([]);
  const [salesByProductId, setSalesByProductId] = useState<Map<string, number>>(() => new Map());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permLoading && !canCuisineHistorique) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canCuisineHistorique, router]);

  const loadDates = useCallback(async () => {
    const { dates, error } = await loadDistinctJournalDates(supabase);
    if (error) {
      setErr(error);
      setKnownDates([]);
      return;
    }
    setKnownDates(dates);
  }, [supabase]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [entriesResult, salesResult] = await Promise.all([
      loadJournalEntriesForDate(supabase, selectedDate),
      loadProductSalesQtyForDate(supabase, selectedDate),
    ]);
    if (entriesResult.error) {
      setErr(entriesResult.error);
      setEntries([]);
    } else {
      setEntries(entriesResult.entries);
    }
    if (salesResult.error) {
      setErr((prev) => prev ?? salesResult.error);
      setSalesByProductId(new Map());
    } else {
      setSalesByProductId(salesResult.byProductId);
    }
    setLoading(false);
  }, [supabase, selectedDate]);

  useEffect(() => {
    if (canCuisineHistorique) void loadDates();
  }, [canCuisineHistorique, loadDates]);

  useEffect(() => {
    if (canCuisineHistorique) void loadEntries();
  }, [canCuisineHistorique, loadEntries]);

  const totals = useMemo(() => aggregateDayTotals(entries), [entries]);

  const productGroups = useMemo(
    () =>
      mergeProductGroupsWithSales(
        aggregateProductTotalsBySubcategory(entries, t("uncategorized"), locale),
        salesByProductId,
      ),
    [entries, locale, salesByProductId, t],
  );

  const totalVentes = useMemo(
    () =>
      productGroups.reduce(
        (sum, group) => sum + group.products.reduce((groupSum, product) => groupSum + (product.ventes ?? 0), 0),
        0,
      ),
    [productGroups],
  );

  const formatQty = useCallback(
    (value: number) => formatNumber(value, { maximumFractionDigits: 3 }),
    [formatNumber],
  );

  const shiftDate = (delta: number) => {
    setSelectedDate((d) => shiftJournalDateIso(d, delta));
  };

  const recentDates = knownDates.slice(0, 8);

  if (permLoading) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!canCuisineHistorique) return null;

  return (
    <main className="mx-auto w-full max-w-xl px-3 py-2">
      <BackNavButton href="/">{tCommon("home")}</BackNavButton>

      <div className="!mt-1 !mb-2 flex flex-row items-center justify-between gap-1">
        <div className="min-w-0">
          <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {t("title")}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {formatJournalDateLabelCompact(locale, selectedDate)}
          </Typography>
        </div>
        {canCuisineSaisie ? (
          <Button
            component={AppLink}
            href="/cuisine/saisie"
            variant="outlined"
            color="success"
            size="small"
            startIcon={<EditNoteOutlinedIcon sx={{ fontSize: 18 }} />}
            sx={{ textTransform: "none", flexShrink: 0, minHeight: 32, py: 0.25, fontSize: "0.8125rem" }}
          >
            {t("saisieLink")}
          </Button>
        ) : null}
      </div>

      <Paper
        elevation={0}
        sx={{ p: 1, mb: 1.5, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}
      >
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <IconButton aria-label={t("prevDay")} onClick={() => shiftDate(-1)} size="small" sx={{ p: 0.5 }}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <TextField
            type="date"
            size="small"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            slotProps={{
              input: { sx: { fontSize: "0.8125rem", py: 0.75 } },
            }}
            sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 1.5 } }}
          />
          <IconButton aria-label={t("nextDay")} onClick={() => shiftDate(1)} size="small" sx={{ p: 0.5 }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Stack>

        {recentDates.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
            {recentDates.map((d) => (
              <Chip
                key={d}
                label={formatJournalDateChip(d)}
                size="small"
                variant={d === selectedDate ? "filled" : "outlined"}
                color={d === selectedDate ? "success" : "default"}
                onClick={() => setSelectedDate(d)}
                sx={{
                  cursor: "pointer",
                  height: 24,
                  fontSize: "0.7rem",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            ))}
          </Box>
        ) : null}

        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            justifyContent: "center",
            textAlign: "center",
            mt: 1,
            pt: 1,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.2 }}>
              {t("totals.entrees")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatQty(totals.entrees)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.2 }}>
              {t("totals.sorties")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatQty(totals.sorties)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.2 }}>
              {t("totals.ventes")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatQty(totalVentes)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {err ? (
        <Typography color="error" className="!mb-2">
          {err}
        </Typography>
      ) : null}

      {loading ? (
        <Typography color="text.secondary">{tCommon("loading")}</Typography>
      ) : productGroups.length === 0 ? (
        <Typography color="text.secondary">{t("emptyDay")}</Typography>
      ) : (
        <CuisineHistoriqueTotalsTable
          groups={productGroups}
          locale={locale}
          formatQty={formatQty}
          labels={{
            product: t("table.product"),
            entrees: t("table.entrees"),
            sorties: t("table.sorties"),
            ventes: t("table.ventes"),
            entreesShort: t("table.entreesShort"),
            sortiesShort: t("table.sortiesShort"),
            ventesShort: t("table.ventesShort"),
          }}
        />
      )}
    </main>
  );
}
