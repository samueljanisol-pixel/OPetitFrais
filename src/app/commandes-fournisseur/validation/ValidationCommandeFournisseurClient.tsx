"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type PendingCmd = {
  id: string;
  created_at: string;
  validated_at?: string | null;
  magasin_id: string;
  supplier_id: string;
  lineCount: number;
  qteTotal: number;
  ref_supplier: { label: string } | { label: string }[] | null;
  magasins: { id: string; code: string; nom: string } | { id: string; code: string; nom: string }[] | null;
};

function formatCmdDateTime(c: PendingCmd, formatDateTime: (value: Date | string | number) => string, emDash: string): string {
  const iso = c.validated_at ?? c.created_at;
  if (!iso) return emDash;
  return formatDateTime(iso);
}

type LotRow = {
  id: string;
  status: string;
  created_at: string;
  marque_prete_at: string | null;
  ref_supplier: { label: string } | { label: string }[] | null;
};

function oneLabel(
  r: { label?: string } | { label?: string }[] | null | undefined,
  emDash: string,
): string {
  if (!r) return emDash;
  const x = Array.isArray(r) ? r[0] : r;
  return (x as { label?: string })?.label ?? emDash;
}

function oneMag(
  m: { code?: string; nom?: string } | { code?: string; nom?: string }[] | null | undefined,
  emDash: string,
): string {
  if (!m) return emDash;
  const x = Array.isArray(m) ? m[0] : m;
  return (x as { code?: string; nom?: string })?.nom ?? (x as { code?: string })?.code ?? emDash;
}

export default function ValidationCommandeFournisseurClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.validation.index");
  const tStatus = useTranslations("backoffice.status");
  const tc = useTranslations("backoffice.commandes.common");
  const te = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const { formatDateTime } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { labelFor } = useStatusLabels();
  const { loading, can } = useSessionPermissions();
  const [commandes, setCommandes] = useState<PendingCmd[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const emDash = tCommon("emDash");

  const load = useCallback(async () => {
    setErr(null);
    setLoadingData(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/commandes-fournisseur/validation/pending", { credentials: "include" }),
        fetch("/api/commandes-fournisseur/validation/lots", { credentials: "include" }),
      ]);
      const j1 = (await r1.json()) as { commandes?: PendingCmd[]; error?: string };
      const j2 = (await r2.json()) as { lots?: LotRow[]; error?: string };
      if (!r1.ok) {
        setErr(j1.error ?? te("generic"));
        setCommandes([]);
      } else {
        setCommandes(j1.commandes ?? []);
      }
      if (r2.ok) {
        setLots(j2.lots ?? []);
      } else {
        if (!r1.ok) return;
        setErr(j2.error ?? te("lotsListFailed"));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setLoadingData(false);
    }
  }, [te]);

  useEffect(() => {
    if (!loading && !can("commandes_fournisseur.consolidation")) {
      void router.replace("/access-refuse");
    }
  }, [loading, can, router]);

  useEffect(() => {
    if (!loading && can("commandes_fournisseur.consolidation")) {
      void load();
    }
  }, [loading, can, load]);

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of commandes) {
      const lab = oneLabel(c.ref_supplier, emDash);
      m.set(c.supplier_id, lab);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [commandes, emDash]);

  const filtered = useMemo(() => {
    if (!filterSupplier) return commandes;
    return commandes.filter((c) => c.supplier_id === filterSupplier);
  }, [commandes, filterSupplier]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const createLot = async () => {
    if (selected.size === 0) {
      setErr(te("selectAtLeastOneOrder"));
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/commandes-fournisseur/validation/lots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeIds: [...selected] }),
      });
      const j = (await res.json()) as { lotId?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? te("generic"));
        return;
      }
      if (j.lotId) {
        setSelected(new Set());
        void router.push(`/commandes-fournisseur/validation/lots/${j.lotId}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="px-4 py-6">{tCommon("loading")}</p>;
  }
  if (!can("commandes_fournisseur.consolidation")) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Button
        component={AppLink}
        href="/commandes-fournisseur"
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
        {tc("back")}
      </Button>
      <Typography variant="h5" className="!mb-4" sx={{ fontWeight: 600 }} component="h1">
        {t("title")}
      </Typography>

      {err ? (
        <Typography color="error" className="!mb-2" variant="body2">
          {err}
        </Typography>
      ) : null}

      <section className="!mb-8">
        <Typography variant="subtitle1" className="!mb-2" sx={{ fontWeight: 600 }}>
          {t("pendingSection")}
        </Typography>
        {loadingData ? (
          <Typography color="text.secondary">{tc("loading")}</Typography>
        ) : commandes.length === 0 ? (
          <Typography color="text.secondary">{t("pendingEmpty")}</Typography>
        ) : (
          <>
            <div className="!mb-3 flex flex-wrap items-end gap-3">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="fs">{tc("supplier")}</InputLabel>
                <Select
                  labelId="fs"
                  label={tc("supplier")}
                  value={filterSupplier}
                  onChange={(e) => {
                    setFilterSupplier(e.target.value as string);
                    setSelected(new Set());
                  }}
                >
                  <MenuItem value="">{tc("allSuppliers")}</MenuItem>
                  {suppliers.map(([id, label]) => (
                    <MenuItem key={id} value={id}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                type="button"
                variant="contained"
                color="success"
                disabled={saving || selected.size === 0}
                onClick={() => void createLot()}
                sx={{ textTransform: "none" }}
              >
                {saving ? tc("loadingEllipsis") : t("createLot")}
              </Button>
            </div>
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
              {filtered.map((c) => (
                <li key={c.id} className="flex items-start gap-2 rounded border border-slate-100 p-2">
                  <FormControlLabel
                    className="!m-0"
                    control={
                      <Checkbox
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        size="small"
                      />
                    }
                    label={
                      <span className="text-sm">
                        {t("pendingRow", {
                          supplier: oneLabel(c.ref_supplier, emDash),
                          store: oneMag(c.magasins, emDash),
                          dateTime: formatCmdDateTime(c, formatDateTime, emDash),
                          productCount: tStatus("productCount", { count: c.lineCount }),
                        })}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="!mb-6">
        <Typography variant="subtitle1" className="!mb-2" sx={{ fontWeight: 600 }}>
          {t("lotsSection")}
        </Typography>
        {lots.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {t("lotsEmpty")}
          </Typography>
        ) : (
          <ul className="space-y-1">
            {lots.map((l) => {
              const isDraft = l.status === "brouillon";
              const isPrete = l.status === "prete";
              const isEmphasized = isDraft || isPrete;
              return (
                <li key={l.id}>
                  <Button
                    component={AppLink}
                    href={`/commandes-fournisseur/validation/lots/${l.id}`}
                    size="small"
                    color={isDraft ? "warning" : isPrete ? "success" : "inherit"}
                    variant={isEmphasized ? "outlined" : "text"}
                    sx={(theme) => ({
                      width: "100%",
                      maxWidth: "100%",
                      textTransform: "none",
                      justifyContent: "flex-start",
                      textAlign: "left",
                      fontWeight: isEmphasized ? 600 : 400,
                      ...(isDraft
                        ? {
                            py: 0.75,
                            px: 1.25,
                            borderWidth: 2,
                            bgcolor: alpha(theme.palette.warning.main, 0.12),
                            "&:hover": {
                              bgcolor: alpha(theme.palette.warning.main, 0.2),
                            },
                          }
                        : isPrete
                          ? {
                              py: 0.75,
                              px: 1.25,
                              borderWidth: 2,
                              bgcolor: alpha(theme.palette.success.main, 0.12),
                              "&:hover": {
                                bgcolor: alpha(theme.palette.success.main, 0.2),
                              },
                            }
                          : {}),
                    })}
                  >
                    {t("lotRow", {
                      supplier: oneLabel(l.ref_supplier, emDash),
                      statusLabel: labelFor("commande_fournisseur_lot", l.status),
                      dateTime: formatDateTime(l.created_at),
                    })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
