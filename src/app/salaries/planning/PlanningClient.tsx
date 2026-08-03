"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import PlanningShiftFormDialog from "@/features/salaries/PlanningShiftFormDialog";
import PlanningWeekGrid from "@/features/salaries/PlanningWeekGrid";
import SalariesSiteSelect from "@/features/salaries/SalariesSiteSelect";
import { useSalariesSites } from "@/features/salaries/useSalariesSites";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { addDaysIso, mondayOfWeek, todayIsoDate } from "@/lib/salaries/planning";
import type { PlanningSalarieRow } from "@/lib/salaries/types";

export default function PlanningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("backoffice.salaries.planning");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();
  const canRead = can("salaries.read");
  const canWrite = can("salaries.write");
  const { sites, loading: sitesLoading } = useSalariesSites(canRead && !permLoading);

  const [siteId, setSiteId] = useState("");
  const [semaine, setSemaine] = useState(() => mondayOfWeek(todayIsoDate()));
  const [viewMode, setViewMode] = useState<"magasin" | "salarie">("magasin");
  const [focusSalarieId, setFocusSalarieId] = useState<string>("");
  const [salaries, setSalaries] = useState<PlanningSalarieRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftSalarieId, setShiftSalarieId] = useState("");
  const [shiftDay, setShiftDay] = useState(0);

  useEffect(() => {
    if (!permLoading && !canRead) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, canRead, router]);

  useEffect(() => {
    if (sites.length > 0 && !siteId) {
      setSiteId(sites[0]!.id);
    }
  }, [sites, siteId]);

  useEffect(() => {
    const qMag = searchParams.get("magasinId");
    const qSem = searchParams.get("semaine");
    const qSal = searchParams.get("salarieId");
    if (qMag) setSiteId(qMag);
    if (qSem && /^\d{4}-\d{2}-\d{2}$/.test(qSem)) setSemaine(mondayOfWeek(qSem));
    if (qSal) {
      setFocusSalarieId(qSal);
      setViewMode("salarie");
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!siteId) {
      setSalaries([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ magasinId: siteId, semaine });
      if (viewMode === "salarie" && focusSalarieId) {
        qs.set("salarieId", focusSalarieId);
      }
      const res = await fetch(`/api/salaries/planning?${qs}`, { credentials: "include" });
      const json = (await res.json()) as {
        salaries?: PlanningSalarieRow[];
        semaine?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        setSalaries([]);
        return;
      }
      if (json.semaine) setSemaine(json.semaine);
      setSalaries(json.salaries ?? []);
    } catch {
      setErr(tCommon("networkError"));
      setSalaries([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, semaine, viewMode, focusSalarieId, tCommon]);

  useEffect(() => {
    if (permLoading || !canRead || sitesLoading) return;
    void load();
  }, [permLoading, canRead, sitesLoading, load]);

  const weekLabel = useMemo(() => {
    const end = addDaysIso(semaine, 6);
    return `${semaine} → ${end}`;
  }, [semaine]);

  function openShift(salarieId: string, dayOfWeek: number) {
    setShiftSalarieId(salarieId);
    setShiftDay(dayOfWeek);
    setShiftOpen(true);
  }

  async function prefillFromHoraires() {
    if (!focusSalarieId) return;
    const res = await fetch(
      `/api/salaries/${encodeURIComponent(focusSalarieId)}/planning/prefill`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ semaine }),
      },
    );
    if (res.ok) void load();
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Button startIcon={<BackChevron fontSize="small" />} component={AppLink} href="/salaries" sx={{ mb: 2 }}>
        {t("backList")}
      </Button>

      <Typography variant="h5" component="h1" gutterBottom>
        {t("title")}
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
        <SalariesSiteSelect
          sites={sites}
          value={siteId}
          onChange={setSiteId}
          label={t("site")}
          selectId="planning-site-select"
        />

        <Button variant="outlined" onClick={() => setSemaine(addDaysIso(semaine, -7))}>
          ←
        </Button>
        <Typography variant="body2">{weekLabel}</Typography>
        <Button variant="outlined" onClick={() => setSemaine(addDaysIso(semaine, 7))}>
          →
        </Button>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, v: "magasin" | "salarie" | null) => v && setViewMode(v)}
        >
          <ToggleButton value="magasin">{t("viewMagasin")}</ToggleButton>
          <ToggleButton value="salarie">{t("viewSalarie")}</ToggleButton>
        </ToggleButtonGroup>

        {viewMode === "salarie" ? (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="planning-salarie">{t("selectSalarie")}</InputLabel>
            <Select
              labelId="planning-salarie"
              label={t("selectSalarie")}
              value={focusSalarieId}
              onChange={(e) => setFocusSalarieId(e.target.value)}
            >
              {salaries.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.prenom}
                  {s.nom ? ` ${s.nom}` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {canWrite && viewMode === "salarie" && focusSalarieId ? (
          <Button variant="outlined" onClick={() => void prefillFromHoraires()}>
            {t("prefillHoraires")}
          </Button>
        ) : null}
      </Box>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <PlanningWeekGrid
            salaries={salaries}
            readOnly={!canWrite}
            focusSalarieId={viewMode === "salarie" ? focusSalarieId : null}
            onCellClick={canWrite ? openShift : undefined}
          />
        )}
      </Paper>

      {canWrite ? (
        <PlanningShiftFormDialog
          open={shiftOpen}
          salarieId={shiftSalarieId}
          semaine={semaine}
          dayOfWeek={shiftDay}
          onClose={() => setShiftOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </Box>
  );
}
