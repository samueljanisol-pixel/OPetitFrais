"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Paper, Stack, Typography } from "@mui/material";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import AppLink from "@/components/AppLink";
import BackNavButton from "@/components/BackNavButton";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadJournalEntriesForDate } from "@/lib/cuisine/journal-queries";
import { todayJournalDateIso, formatJournalDateLabel } from "@/lib/cuisine/production-date";
import { aggregateDayTotals } from "@/lib/cuisine/aggregate-day-totals";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import type { CuisineJournalEntryWithProduct } from "@/lib/cuisine/types";
import CuisineEntryList from "./CuisineEntryList";

export default function CuisineSaisieClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.cuisine.saisie");
  const tCommon = useTranslations("common");
  const { locale, formatNumber } = useAppFormat();
  const { loading: permLoading, canCuisineSaisie } = useSessionPermissions();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const journalDate = useMemo(() => todayJournalDateIso(), []);
  const [entries, setEntries] = useState<CuisineJournalEntryWithProduct[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const { entries: rows, error } = await loadJournalEntriesForDate(supabase, journalDate);
    if (error) {
      setErr(error);
      setEntries([]);
    } else {
      setEntries(rows);
    }
    setLoading(false);
  }, [supabase, journalDate]);

  useEffect(() => {
    if (!permLoading && !canCuisineSaisie) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canCuisineSaisie, router]);

  useEffect(() => {
    if (canCuisineSaisie) void load();
  }, [canCuisineSaisie, load]);

  const totals = useMemo(() => aggregateDayTotals(entries), [entries]);

  const quantityLabel = useCallback(
    (qty: number, unit: string) => {
      const n = formatNumber(qty, { maximumFractionDigits: 3 });
      return unit ? t("quantityWithUnit", { quantity: n, unit }) : t("quantityOnly", { quantity: n });
    },
    [formatNumber, t],
  );

  if (permLoading) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!canCuisineSaisie) return null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <BackNavButton href="/">{tCommon("home")}</BackNavButton>

      <div className="!mt-2 !mb-4">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatJournalDateLabel(locale, journalDate)}
        </Typography>
      </div>

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
              {formatNumber(totals.entrees, { maximumFractionDigits: 3 })}
            </Typography>
          </div>
          <div>
            <Typography variant="caption" color="text.secondary">
              {t("totals.sorties")}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {formatNumber(totals.sorties, { maximumFractionDigits: 3 })}
            </Typography>
          </div>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <Button
          component={AppLink}
          href="/cuisine/saisie/ajouter?type=entree"
          variant="contained"
          color="success"
          fullWidth
          startIcon={<AddCircleOutlineOutlinedIcon />}
          sx={{ textTransform: "none", py: 1.25 }}
        >
          {t("addEntree")}
        </Button>
        <Button
          component={AppLink}
          href="/cuisine/saisie/ajouter?type=sortie"
          variant="outlined"
          color="inherit"
          fullWidth
          startIcon={<RemoveCircleOutlineOutlinedIcon />}
          sx={{ textTransform: "none", py: 1.25 }}
        >
          {t("addSortie")}
        </Button>
      </Stack>

      {err ? (
        <Typography color="error" className="!mb-2">
          {err}
        </Typography>
      ) : null}

      {loading ? (
        <Typography color="text.secondary">{tCommon("loading")}</Typography>
      ) : (
        <Stack spacing={4}>
          <CuisineEntryList
            title={t("sections.entrees")}
            entryType="entree"
            entries={entries}
            emptyLabel={t("emptyEntrees")}
            quantityLabel={quantityLabel}
            timePrefix={t("atTime")}
          />
          <CuisineEntryList
            title={t("sections.sorties")}
            entryType="sortie"
            entries={entries}
            emptyLabel={t("emptySorties")}
            quantityLabel={quantityLabel}
            timePrefix={t("atTime")}
          />
        </Stack>
      )}
    </main>
  );
}
