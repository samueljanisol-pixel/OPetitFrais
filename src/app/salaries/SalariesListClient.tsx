"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import SalariesSiteSelect from "@/features/salaries/SalariesSiteSelect";
import SalarieFormDialog from "@/features/salaries/SalarieFormDialog";
import { useSalariesSites } from "@/features/salaries/useSalariesSites";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import type { SalarieListItem } from "@/lib/salaries/types";

export default function SalariesListClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.salaries.list");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();
  const canRead = can("salaries.read");
  const canWrite = can("salaries.write");
  const { sites, loading: sitesLoading, err: sitesErr } = useSalariesSites(canRead && !permLoading);

  const [siteId, setSiteId] = useState("");
  const [includeDeparted, setIncludeDeparted] = useState(false);
  const [salaries, setSalaries] = useState<SalarieListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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

  const load = useCallback(async () => {
    if (!siteId) {
      setSalaries([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        magasinId: siteId,
        includeDeparted: includeDeparted ? "1" : "0",
      });
      const res = await fetch(`/api/salaries?${qs}`, { credentials: "include" });
      const json = (await res.json()) as { salaries?: SalarieListItem[]; error?: string };
      if (!res.ok) {
        setErr(json.error ?? tCommon("error"));
        setSalaries([]);
        return;
      }
      setSalaries(json.salaries ?? []);
    } catch {
      setErr(tCommon("networkError"));
      setSalaries([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, includeDeparted, tCommon]);

  useEffect(() => {
    if (permLoading || !canRead || sitesLoading) return;
    void load();
  }, [permLoading, canRead, sitesLoading, load]);

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Button startIcon={<BackChevron fontSize="small" />} component={AppLink} href="/" sx={{ mb: 2 }}>
        {t("backHome")}
      </Button>

      <Typography variant="h5" component="h1" gutterBottom>
        {t("title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t("subtitle")}
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
        <SalariesSiteSelect
          sites={sites}
          value={siteId}
          onChange={setSiteId}
          label={t("site")}
          selectId="site-select"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={includeDeparted}
              onChange={(e) => setIncludeDeparted(e.target.checked)}
            />
          }
          label={t("includeDeparted")}
        />

        <Box sx={{ flex: 1 }} />

        <Button component={AppLink} href="/salaries/planning" variant="outlined">
          {t("planning")}
        </Button>

        {canWrite && siteId ? (
          <Button variant="contained" onClick={() => setAddOpen(true)}>
            {t("add")}
          </Button>
        ) : null}
      </Box>

      {sitesErr ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {sitesErr}
        </Alert>
      ) : null}

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {!sitesLoading && sites.length === 0 && !permLoading ? (
        <Alert severity="warning">{t("noSite")}</Alert>
      ) : null}

      <Paper variant="outlined">
        {loading || sitesLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : salaries.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
            {t("empty")}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("columnNom")}</TableCell>
                <TableCell>{t("columnPrenom")}</TableCell>
                <TableCell>{t("columnArrivee")}</TableCell>
                <TableCell>{t("columnStatut")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {salaries.map((s) => (
                <TableRow
                  key={s.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => void router.push(`/salaries/${encodeURIComponent(s.id)}`)}
                >
                  <TableCell>{s.nom ?? "—"}</TableCell>
                  <TableCell>{s.prenom}</TableCell>
                  <TableCell>{s.date_arrivee}</TableCell>
                  <TableCell>{s.actif ? t("actif") : t("parti")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {canWrite && siteId ? (
        <SalarieFormDialog
          open={addOpen}
          magasinId={siteId}
          onClose={() => setAddOpen(false)}
          onSaved={(id) => {
            void load();
            void router.push(`/salaries/${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </Box>
  );
}
