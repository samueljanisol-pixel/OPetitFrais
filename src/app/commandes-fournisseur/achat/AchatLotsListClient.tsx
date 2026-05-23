"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import { useRouter } from "next/navigation";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type SupplierRefOne = { id?: string; code?: string; label?: string } | null | undefined;

type LotRow = {
  id: string;
  supplier_id: string;
  status: string;
  marque_prete_at: string | null;
  marque_terminee_at: string | null;
  created_at: string;
  ref_supplier: SupplierRefOne | SupplierRefOne[];
};

function supplierLabel(raw: LotRow["ref_supplier"]): string {
  if (raw == null) return "";
  const o = Array.isArray(raw) ? raw[0] : raw;
  const lb = typeof o?.label === "string" ? o.label.trim() : "";
  const code = typeof o?.code === "string" ? o.code.trim() : "";
  if (lb.length > 0) return lb;
  if (code.length > 0) return code;
  return "";
}

export default function AchatLotsListClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.achat.list");
  const tc = useTranslations("backoffice.commandes.common");
  const te = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const { labelFor } = useStatusLabels();
  const { formatDateTime } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();
  const [statusMode, setStatusMode] = useState<"prete" | "all">("prete");
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.achat")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const q = statusMode === "all" ? "?status=all" : "?status=prete";
      const res = await fetch(`/api/commandes-fournisseur/achat/lots${q}`, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as { lots?: LotRow[]; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : te("loadFailed"));
        setLots([]);
        return;
      }
      setLots(Array.isArray(json.lots) ? json.lots : []);
    } catch {
      setErr(te("networkUnavailable"));
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, [statusMode, te]);

  useEffect(() => {
    if (!permLoading && can("commandes_fournisseur.achat")) {
      void load();
    }
  }, [permLoading, can, load]);

  const handleToggle = (_ev: unknown, next: "prete" | "all" | null) => {
    if (!next) return;
    setStatusMode(next);
  };

  if (permLoading) {
    return <p className="px-4 py-6">{tCommon("loading")}</p>;
  }

  if (!can("commandes_fournisseur.achat")) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Button
        component={AppLink}
        href="/"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        {tCommon("home")}
      </Button>
      <Typography variant="h5" className="!mb-1" sx={{ fontWeight: 600 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-4">
        {t("subtitle")}
      </Typography>

      <div className="flex flex-wrap items-center gap-2 !mb-4">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={statusMode}
          onChange={handleToggle}
          aria-label={t("filterAria")}
          sx={{
            "& .MuiToggleButton-root": {
              textTransform: "none",
            },
          }}
        >
          <ToggleButton value="prete">{t("filterPending")}</ToggleButton>
          <ToggleButton value="all">{t("filterAll")}</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant="outlined" onClick={() => void load()} sx={{ textTransform: "none" }}>
          {tc("refresh")}
        </Button>
      </div>

      {err ? (
        <Alert severity="error" className="!mb-3">
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-600">
          <CircularProgress size={20} /> {t("loadingLots")}
        </div>
      ) : lots.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("emptyLots")}
        </Typography>
      ) : (
        <div className="flex flex-col gap-3">
          {lots.map((l) => (
            <Paper
              key={l.id}
              variant="outlined"
              sx={{
                px: 1.5,
                py: 2.5,
                borderRadius: 2,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }} className="truncate">
                    {supplierLabel(l.ref_supplier) || tCommon("emDash")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {t("lotStatusLine", {
                      status: labelFor("commande_fournisseur_lot", String(l.status)),
                      readyDate: l.marque_prete_at ? formatDateTime(l.marque_prete_at) : tCommon("emDash"),
                    })}
                    {l.status === "terminee" ? (
                      <>
                        {t("lotStatusClosed", {
                          closedDate: l.marque_terminee_at ? formatDateTime(l.marque_terminee_at) : tCommon("emDash"),
                        })}
                      </>
                    ) : null}
                  </Typography>
                </div>
                <Button
                  component={AppLink}
                  href={`/commandes-fournisseur/achat/lots/${l.id}`}
                  variant="contained"
                  size="small"
                  sx={{ textTransform: "none", flexShrink: 0 }}
                >
                  {tc("open")}
                </Button>
              </div>
            </Paper>
          ))}
        </div>
      )}
    </main>
  );
}
