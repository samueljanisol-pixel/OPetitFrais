"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import CommandeFournisseurStatusChip from "@/components/commandes-fournisseur/CommandeFournisseurStatusChip";
import { useRouter } from "next/navigation";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";
import { supplierColor } from "@/lib/commandes-fournisseur/supplier-color";

type SupplierRefOne = { id?: string; code?: string; label?: string } | null | undefined;

type LotRow = {
  id: string;
  supplier_id: string;
  status: string;
  marque_prete_at: string | null;
  marque_terminee_at: string | null;
  created_at: string;
  date_livraison?: string | null;
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
  const tValidation = useTranslations("backoffice.commandes.validation.index");
  const tc = useTranslations("backoffice.commandes.common");
  const te = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const { labelFor } = useStatusLabels();
  const { formatDateTime, formatDate } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();
  const [statusMode, setStatusMode] = useState<"prete" | "terminee">("prete");
  const [filterSupplier, setFilterSupplier] = useState<string>("");
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const emDash = tCommon("emDash");

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.achat")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const q = statusMode === "terminee" ? "?status=terminee" : "?status=prete";
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

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lots) {
      const lab = supplierLabel(l.ref_supplier) || emDash;
      m.set(l.supplier_id, lab);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lots, emDash]);

  const filteredLots = useMemo(() => {
    if (!filterSupplier) return lots;
    return lots.filter((l) => l.supplier_id === filterSupplier);
  }, [lots, filterSupplier]);

  const handleToggle = (_ev: unknown, next: "prete" | "terminee" | null) => {
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
    <main className="mx-auto w-full max-w-lg px-4 py-4">
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

      <div className="!mb-4 flex flex-wrap items-center gap-2">
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
          <ToggleButton value="terminee">{t("filterAll")}</ToggleButton>
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
        <>
          <div className="!mb-3">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="achat-fs">{tc("supplier")}</InputLabel>
              <Select
                labelId="achat-fs"
                label={tc("supplier")}
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value as string)}
              >
                <MenuItem value="">{tc("allSuppliers")}</MenuItem>
                {suppliers.map(([id, label]) => (
                  <MenuItem key={id} value={id}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
          {filteredLots.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("filteredEmpty")}
            </Typography>
          ) : (
            <List dense disablePadding>
              {filteredLots.map((l) => (
                <ListItem key={l.id} disablePadding className="!mb-1">
                  <ListItemButton
                    component={AppLink}
                    href={`/commandes-fournisseur/achat/lots/${l.id}`}
                    sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}
                  >
                    <ListItemText
                      primary={
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className="min-w-0 truncate font-bold"
                            style={{ color: supplierColor(l.supplier_id) }}
                          >
                            {supplierLabel(l.ref_supplier) || emDash}
                          </span>
                          <CommandeFournisseurStatusChip
                            domain="commande_fournisseur_lot"
                            status={String(l.status)}
                            label={labelFor("commande_fournisseur_lot", String(l.status))}
                          />
                        </span>
                      }
                      secondary={
                        <>
                          {tValidation("pendingRowCreated", {
                            dateTime: formatDateTime(l.created_at),
                          })}
                          {" — "}
                          {tValidation("pendingRowDelivery", {
                            date:
                              typeof l.date_livraison === "string" && l.date_livraison.length > 0
                                ? formatDate(`${l.date_livraison}T12:00:00`)
                                : emDash,
                          })}
                          {l.status === "terminee" ? (
                            <>
                              {" — "}
                              {t("lotClosedLine", {
                                closedDate: l.marque_terminee_at
                                  ? formatDateTime(l.marque_terminee_at)
                                  : emDash,
                              })}
                            </>
                          ) : null}
                        </>
                      }
                      slotProps={{
                        primary: { component: "div" },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}
    </main>
  );
}
