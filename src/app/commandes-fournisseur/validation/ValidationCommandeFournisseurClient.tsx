"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import CommandeFournisseurStatusChip from "@/components/commandes-fournisseur/CommandeFournisseurStatusChip";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type PendingCmd = {
  id: string;
  created_at: string;
  validated_at?: string | null;
  date_livraison?: string | null;
  magasin_id: string;
  supplier_id: string;
  lineCount: number;
  qteTotal: number;
  ref_supplier: { label: string } | { label: string }[] | null;
  magasins: { id: string; code: string; nom: string } | { id: string; code: string; nom: string }[] | null;
};

function formatCmdDateTime(
  c: PendingCmd,
  formatDateTime: (value: Date | string | number) => string,
  formatDate: (value: Date | string | number) => string,
  emDash: string,
): string {
  const iso = c.validated_at ?? c.created_at;
  const base = iso ? formatDateTime(iso) : emDash;
  if (typeof c.date_livraison === "string" && c.date_livraison.length > 0) {
    return `${base} · ${formatDate(`${c.date_livraison}T12:00:00`)}`;
  }
  return base;
}

type LotRow = {
  id: string;
  status: string;
  created_at: string;
  date_livraison?: string | null;
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
  const { formatDateTime, formatDate } = useAppFormat();
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
  const [singleStoreConfirmOpen, setSingleStoreConfirmOpen] = useState(false);
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

  const selectedCommandes = useMemo(
    () => commandes.filter((c) => selected.has(c.id)),
    [commandes, selected],
  );

  const selectedSupplierIds = useMemo(
    () => new Set(selectedCommandes.map((c) => c.supplier_id)),
    [selectedCommandes],
  );

  const selectedMagasinIds = useMemo(
    () => new Set(selectedCommandes.map((c) => c.magasin_id)),
    [selectedCommandes],
  );

  const lockedDeliveryDate = useMemo((): string | null | undefined => {
    if (selectedCommandes.length === 0) return undefined;
    return selectedCommandes[0]!.date_livraison ?? null;
  }, [selectedCommandes]);

  const singleSelectedStoreLabel = useMemo(() => {
    if (selectedMagasinIds.size !== 1) return emDash;
    const cmd = selectedCommandes[0];
    if (!cmd) return emDash;
    return oneMag(cmd.magasins, emDash);
  }, [selectedCommandes, selectedMagasinIds.size, emDash]);

  const lockedSupplierId = useMemo(() => {
    if (selectedCommandes.length === 0) return null;
    return selectedCommandes[0]!.supplier_id;
  }, [selectedCommandes]);

  const lockedSupplierLabel = useMemo(() => {
    if (!lockedSupplierId) return null;
    return suppliers.find(([id]) => id === lockedSupplierId)?.[1] ?? emDash;
  }, [lockedSupplierId, suppliers, emDash]);

  const activeLots = useMemo(
    () => lots.filter((l) => l.status !== "terminee"),
    [lots],
  );

  const finishedLots = useMemo(
    () => lots.filter((l) => l.status === "terminee"),
    [lots],
  );

  const toggle = (id: string, supplierId: string, deliveryDate: string | null | undefined) => {
    if (lockedSupplierId && supplierId !== lockedSupplierId) {
      return;
    }
    const normalizedDate = deliveryDate ?? null;
    if (lockedDeliveryDate !== undefined && normalizedDate !== lockedDeliveryDate) {
      return;
    }
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const executeCreateLot = async () => {
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

  const handleCreateLotClick = () => {
    if (selected.size === 0) {
      setErr(te("selectAtLeastOneOrder"));
      return;
    }
    if (selectedSupplierIds.size > 1) {
      setErr(te("sameSupplierRequired"));
      return;
    }
    const deliveryDates = new Set(
      selectedCommandes.map((c) => c.date_livraison ?? null),
    );
    if (deliveryDates.size > 1) {
      setErr(te("sameDeliveryDateRequired"));
      return;
    }
    setErr(null);
    if (selectedMagasinIds.size === 1) {
      setSingleStoreConfirmOpen(true);
      return;
    }
    void executeCreateLot();
  };

  if (loading) {
    return <p className="px-4 py-6">{tCommon("loading")}</p>;
  }
  if (!can("commandes_fournisseur.consolidation")) {
    return null;
  }

  const renderLotList = (items: LotRow[]) => (
    <List dense disablePadding>
      {items.map((l) => (
        <ListItem key={l.id} disablePadding className="!mb-1">
          <ListItemButton
            component={AppLink}
            href={`/commandes-fournisseur/validation/lots/${l.id}`}
            sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}
          >
            <ListItemText
              primary={
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{oneLabel(l.ref_supplier, emDash)}</span>
                  <CommandeFournisseurStatusChip
                    domain="commande_fournisseur_lot"
                    status={l.status}
                    label={labelFor("commande_fournisseur_lot", l.status)}
                  />
                </span>
              }
              secondary={
                typeof l.date_livraison === "string" && l.date_livraison.length > 0
                  ? t("lotRowWithDelivery", {
                      dateTime: formatDateTime(l.created_at),
                      deliveryDate: formatDate(`${l.date_livraison}T12:00:00`),
                    })
                  : formatDateTime(l.created_at)
              }
              slotProps={{
                primary: { component: "div" },
              }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
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
                onClick={handleCreateLotClick}
                sx={{ textTransform: "none" }}
              >
                {saving ? tc("loadingEllipsis") : t("createLot")}
              </Button>
            </div>
            {lockedSupplierLabel ? (
              <Typography variant="caption" color="text.secondary" className="!mb-2 block">
                {t("selectionLockedSupplier", { supplier: lockedSupplierLabel })}
              </Typography>
            ) : null}
            {lockedDeliveryDate !== undefined ? (
              <Typography variant="caption" color="text.secondary" className="!mb-2 block">
                {lockedDeliveryDate
                  ? t("selectionLockedDeliveryDate", {
                      date: formatDate(`${lockedDeliveryDate}T12:00:00`),
                    })
                  : t("selectionLockedNoDeliveryDate")}
              </Typography>
            ) : null}
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
              {filtered.map((c) => {
                const rowDisabled =
                  (lockedSupplierId !== null && c.supplier_id !== lockedSupplierId) ||
                  (lockedDeliveryDate !== undefined &&
                    (c.date_livraison ?? null) !== lockedDeliveryDate);
                return (
                <li
                  key={c.id}
                  className={`flex items-start gap-2 rounded border border-slate-100 p-2${rowDisabled ? " opacity-50" : ""}`}
                >
                  <FormControlLabel
                    className="!m-0"
                    disabled={rowDisabled}
                    control={
                      <Checkbox
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id, c.supplier_id, c.date_livraison)}
                        disabled={rowDisabled}
                        size="small"
                      />
                    }
                    label={
                      <span className="text-sm">
                        {t("pendingRow", {
                          supplier: oneLabel(c.ref_supplier, emDash),
                          store: oneMag(c.magasins, emDash),
                          dateTime: formatCmdDateTime(c, formatDateTime, formatDate, emDash),
                          productCount: tStatus("productCount", { count: c.lineCount }),
                        })}
                      </span>
                    }
                  />
                </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="!mb-6">
        <Typography variant="subtitle1" className="!mb-2" sx={{ fontWeight: 600 }}>
          {t("lotsSection")}
        </Typography>
        {loadingData ? (
          <Typography color="text.secondary" variant="body2">
            {tc("loading")}
          </Typography>
        ) : activeLots.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {t("lotsEmpty")}
          </Typography>
        ) : (
          renderLotList(activeLots)
        )}
      </section>

      <section className="!mb-6">
        <Typography variant="subtitle1" className="!mb-2" sx={{ fontWeight: 600 }}>
          {t("lotsFinishedSection")}
        </Typography>
        {loadingData ? (
          <Typography color="text.secondary" variant="body2">
            {tc("loading")}
          </Typography>
        ) : finishedLots.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {t("lotsFinishedEmpty")}
          </Typography>
        ) : (
          renderLotList(finishedLots)
        )}
      </section>

      <Dialog
        open={singleStoreConfirmOpen}
        onClose={() => {
          if (!saving) setSingleStoreConfirmOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 0.5 }}>{t("createLotSingleStoreDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("createLotSingleStoreDialog.body", { store: singleSelectedStoreLabel })}
          </Typography>
        </DialogContent>
        <DialogActions className="!px-3 !pb-2">
          <Button
            type="button"
            color="inherit"
            onClick={() => setSingleStoreConfirmOpen(false)}
            sx={{ textTransform: "none" }}
            disabled={saving}
          >
            {t("createLotSingleStoreDialog.cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="success"
            disabled={saving}
            onClick={() => {
              setSingleStoreConfirmOpen(false);
              void executeCreateLot();
            }}
            sx={{ textTransform: "none" }}
          >
            {saving ? tc("loadingEllipsis") : t("createLotSingleStoreDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
