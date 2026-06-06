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
  formatJournalDateLabel,
  shiftJournalDateIso,
  todayJournalDateIso,
} from "@/lib/cuisine/production-date";
import { aggregateDayTotals } from "@/lib/cuisine/aggregate-day-totals";
import { aggregateProductTotalsBySubcategory } from "@/lib/cuisine/aggregate-product-totals";
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
    const { entries: rows, error } = await loadJournalEntriesForDate(supabase, selectedDate);
    if (error) {
      setErr(error);
      setEntries([]);
    } else {
      setEntries(rows);
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
    () => aggregateProductTotalsBySubcategory(entries, t("uncategorized")),
    [entries, t],
  );

  const formatQty = useCallback(
    (value: number) => formatNumber(value, { maximumFractionDigits: 3 }),
    [formatNumber],
  );

  const shiftDate = (delta: number) => {
    setSelectedDate((d) => shiftJournalDateIso(d, delta));
  };

  const recentDates = knownDates.slice(0, 12);

  if (permLoading) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!canCuisineHistorique) return null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <BackNavButton href="/">{tCommon("home")}</BackNavButton>

      <div className="!mt-2 !mb-4 flex flex-row items-start justify-between gap-2">
        <div>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatJournalDateLabel(locale, selectedDate)}
          </Typography>
        </div>
        {canCuisineSaisie ? (
          <Button
            component={AppLink}
            href="/cuisine/saisie"
            variant="outlined"
            color="success"
            size="small"
            startIcon={<EditNoteOutlinedIcon />}
            sx={{ textTransform: "none", flexShrink: 0 }}
          >
            {t("saisieLink")}
          </Button>
        ) : null}
      </div>

      <Paper
        elevation={0}
        sx={{ p: 1.5, mb: 2, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <IconButton aria-label={t("prevDay")} onClick={() => shiftDate(-1)} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <TextField
            type="date"
            size="small"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            label={t("dateLabel")}
            sx={{ flex: 1 }}
          />
          <IconButton aria-label={t("nextDay")} onClick={() => shiftDate(1)} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Stack>

        {recentDates.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.5 }}>
            {recentDates.map((d) => (
              <Chip
                key={d}
                label={d}
                size="small"
                variant={d === selectedDate ? "filled" : "outlined"}
                color={d === selectedDate ? "success" : "default"}
                onClick={() => setSelectedDate(d)}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>
        ) : null}
      </Paper>

      <Paper
        elevation={0}
        sx={{ p: 1.5, mb: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
      >
        <Stack direction="row" spacing={2} sx={{ justifyContent: "space-around", textAlign: "center" }}>
          <div>
            <Typography variant="caption" color="text.secondary">
              {t("totals.entrees")}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {formatQty(totals.entrees)}
            </Typography>
          </div>
          <div>
            <Typography variant="caption" color="text.secondary">
              {t("totals.sorties")}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {formatQty(totals.sorties)}
            </Typography>
          </div>
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
          }}
        />
      )}
    </main>
  );
}
