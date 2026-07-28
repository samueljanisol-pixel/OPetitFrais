"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import BackNavButton from "@/components/BackNavButton";
import AppLink from "@/components/AppLink";
import { useTranslations } from "next-intl";
import { proposedSalePrice, type ActualisationQueue } from "@/lib/products/actualisation";
import type {
  ActualisationPrixItem,
  ActualisationQueueItem,
} from "@/app/api/produits/actualisation/route";

type PrixDraft = {
  margin: string;
  price: string;
  visible_vitrine: boolean;
  manualPrice: boolean;
};

type FlagDraft = {
  active: boolean;
  visible_vitrine: boolean;
};

function formatNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned.trim() === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function buildPrixDraft(item: ActualisationPrixItem): PrixDraft {
  const margin = item.product.margin ?? 0;
  const price = proposedSalePrice({
    costPurchase: item.product.cost_purchase,
    costManufacturing: item.product.cost_manufacturing,
    costPackaging: item.product.cost_packaging,
    margin,
  });
  return {
    margin: String(margin),
    price: String(Math.round(price * 100) / 100),
    visible_vitrine: item.product.active ? item.product.visible_vitrine : false,
    manualPrice: false,
  };
}

function productEditHref(productId: string): string {
  return `/produits/${productId}?returnTo=${encodeURIComponent("/produits/actualisation")}`;
}

function ProductNameCell({
  name,
  code,
  productId,
  badge,
  editLabel,
}: {
  name: string;
  code: string | null;
  productId: string;
  badge?: string;
  editLabel: string;
}) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {code ?? productId.slice(0, 8)}
          {badge ? ` · ${badge}` : ""}
        </Typography>
      </Box>
      <Tooltip title={editLabel}>
        <IconButton
          component={AppLink}
          href={productEditHref(productId)}
          size="small"
          aria-label={editLabel}
          sx={{ mt: -0.25 }}
        >
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function SelectionToolbar({
  selectedCount,
  total,
  allSelected,
  someSelected,
  onToggleAll,
  onValidate,
  onDismiss,
  disabled,
  t,
}: {
  selectedCount: number;
  total: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onValidate: () => void;
  onDismiss: () => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  if (total === 0) return null;
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{ alignItems: { xs: "stretch", sm: "center" }, flexWrap: "wrap" }}
    >
      <Button size="small" variant="text" onClick={onToggleAll} disabled={disabled} sx={{ textTransform: "none" }}>
        {allSelected ? t("unselectAll") : t("selectAll")}
        {someSelected ? ` (${selectedCount})` : ""}
      </Button>
      <Button
        size="small"
        variant="contained"
        color="success"
        disabled={disabled || selectedCount === 0}
        onClick={onValidate}
        sx={{ textTransform: "none", fontWeight: 600 }}
      >
        {t("validateSelection")}
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        disabled={disabled || selectedCount === 0}
        onClick={onDismiss}
        sx={{ textTransform: "none" }}
      >
        {t("dismissSelection")}
      </Button>
    </Stack>
  );
}

export default function ActualisationProduitClient() {
  const t = useTranslations("backoffice.productActualisation");
  const tCommon = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prixItems, setPrixItems] = useState<ActualisationPrixItem[]>([]);
  const [activationItems, setActivationItems] = useState<ActualisationQueueItem[]>([]);
  const [desactItems, setDesactItems] = useState<ActualisationQueueItem[]>([]);
  const [prixDrafts, setPrixDrafts] = useState<Record<string, PrixDraft>>({});
  const [activationDrafts, setActivationDrafts] = useState<Record<string, FlagDraft>>({});
  const [desactDrafts, setDesactDrafts] = useState<Record<string, FlagDraft>>({});
  const [selectedPrix, setSelectedPrix] = useState<Set<string>>(new Set());
  const [selectedActivation, setSelectedActivation] = useState<Set<string>>(new Set());
  const [selectedDesact, setSelectedDesact] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/produits/actualisation", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        prix?: ActualisationPrixItem[];
        activation?: ActualisationQueueItem[];
        desactivation?: ActualisationQueueItem[];
      };
      if (!res.ok) throw new Error(json.error ?? t("errors.loadFailed"));
      const prix = json.prix ?? [];
      const activation = json.activation ?? [];
      const desactivation = json.desactivation ?? [];
      setPrixItems(prix);
      setActivationItems(activation);
      setDesactItems(desactivation);
      const pd: Record<string, PrixDraft> = {};
      for (const item of prix) pd[item.product_id] = buildPrixDraft(item);
      setPrixDrafts(pd);
      const ad: Record<string, FlagDraft> = {};
      for (const item of activation) {
        ad[item.product_id] = { active: true, visible_vitrine: false };
      }
      setActivationDrafts(ad);
      const dd: Record<string, FlagDraft> = {};
      for (const item of desactivation) {
        dd[item.product_id] = { active: false, visible_vitrine: false };
      }
      setDesactDrafts(dd);
      setSelectedPrix(new Set());
      setSelectedActivation(new Set());
      setSelectedDesact(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [t, tCommon]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMargin = (productId: string, marginStr: string) => {
    setPrixDrafts((prev) => {
      const cur = prev[productId];
      if (!cur) return prev;
      const item = prixItems.find((x) => x.product_id === productId);
      if (!item) return prev;
      const marginNum = parseNum(marginStr);
      const next: PrixDraft = { ...cur, margin: marginStr };
      if (!cur.manualPrice && marginNum != null) {
        const price = proposedSalePrice({
          costPurchase: item.product.cost_purchase,
          costManufacturing: item.product.cost_manufacturing,
          costPackaging: item.product.cost_packaging,
          margin: marginNum,
        });
        next.price = String(Math.round(price * 100) / 100);
      }
      return { ...prev, [productId]: next };
    });
  };

  const setPrice = (productId: string, priceStr: string) => {
    setPrixDrafts((prev) => {
      const cur = prev[productId];
      if (!cur) return prev;
      return {
        ...prev,
        [productId]: { ...cur, price: priceStr, manualPrice: true },
      };
    });
  };

  const toggleInSet = (setter: Dispatch<SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllInSet = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    ids: string[],
    select: boolean,
  ) => {
    setter(select ? new Set(ids) : new Set());
  };

  const dismiss = async (queue: ActualisationQueue, productIds: string[]) => {
    if (productIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/produits/actualisation/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue, productIds }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("errors.dismissFailed"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  const validatePrix = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const items = [];
      for (const productId of productIds) {
        const draft = prixDrafts[productId];
        const item = prixItems.find((x) => x.product_id === productId);
        if (!draft || !item) continue;
        const price = parseNum(draft.price);
        if (price == null || price < 0) {
          throw new Error(t("errors.invalidPrice", { name: item.product.name }));
        }
        items.push({
          productId,
          price,
          margin: parseNum(draft.margin),
          visible_vitrine: draft.visible_vitrine,
        });
      }
      if (items.length === 0) return;

      const res = await fetch("/api/produits/actualisation/prix/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("errors.validateFailed"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  const validateFlags = async (
    queue: "activation" | "desactivation",
    productIds: string[],
    drafts: Record<string, FlagDraft>,
  ) => {
    if (productIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const items = productIds.flatMap((productId) => {
        const draft = drafts[productId];
        if (!draft) return [];
        return [
          {
            productId,
            active: draft.active,
            visible_vitrine: draft.visible_vitrine,
          },
        ];
      });
      if (items.length === 0) return;

      const path =
        queue === "activation"
          ? "/api/produits/actualisation/activation/validate"
          : "/api/produits/actualisation/desactivation/validate";
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("errors.validateFailed"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  const prixIds = useMemo(() => prixItems.map((x) => x.product_id), [prixItems]);
  const actIds = useMemo(() => activationItems.map((x) => x.product_id), [activationItems]);
  const desactIds = useMemo(() => desactItems.map((x) => x.product_id), [desactItems]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-col gap-1">
          <BackNavButton href="/" size="small">
            {t("backHome")}
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: "#0f172a" }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" className="!text-slate-600">
            {t("subtitle")}
          </Typography>
        </div>

        {error ? (
          <Alert severity="error" className="!mb-3" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        {loading ? (
          <Typography className="!text-slate-600">{tCommon("loading")}</Typography>
        ) : (
          <Stack spacing={3}>
            {/* Prix */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "rgba(255,255,255,0.95)",
              }}
            >
              <Stack spacing={1.5} className="!mb-2">
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("prixSection")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("prixHint")}
                  </Typography>
                </Box>
                <SelectionToolbar
                  selectedCount={selectedPrix.size}
                  total={prixItems.length}
                  allSelected={prixItems.length > 0 && selectedPrix.size === prixItems.length}
                  someSelected={selectedPrix.size > 0}
                  onToggleAll={() =>
                    setAllInSet(setSelectedPrix, prixIds, selectedPrix.size !== prixItems.length)
                  }
                  onValidate={() => void validatePrix([...selectedPrix])}
                  onDismiss={() => void dismiss("prix", [...selectedPrix])}
                  disabled={saving}
                  t={t}
                />
              </Stack>

              {prixItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("prixEmpty")}
                </Typography>
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={prixItems.length > 0 && selectedPrix.size === prixItems.length}
                            indeterminate={
                              selectedPrix.size > 0 && selectedPrix.size < prixItems.length
                            }
                            onChange={() =>
                              setAllInSet(
                                setSelectedPrix,
                                prixIds,
                                selectedPrix.size !== prixItems.length,
                              )
                            }
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell>{t("columns.product")}</TableCell>
                        <TableCell align="right">{t("columns.currentPrice")}</TableCell>
                        <TableCell align="right">{t("columns.costPurchase")}</TableCell>
                        <TableCell align="right">{t("columns.margin")}</TableCell>
                        <TableCell align="right">{t("columns.proposedPrice")}</TableCell>
                        <TableCell align="center">{t("columns.vitrine")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {prixItems.map((item) => {
                        const draft = prixDrafts[item.product_id] ?? buildPrixDraft(item);
                        return (
                          <TableRow key={item.product_id} hover selected={selectedPrix.has(item.product_id)}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={selectedPrix.has(item.product_id)}
                                onChange={() => toggleInSet(setSelectedPrix, item.product_id)}
                                disabled={saving}
                              />
                            </TableCell>
                            <TableCell>
                              <ProductNameCell
                                name={item.product.name}
                                code={item.product.code}
                                productId={item.product_id}
                                badge={!item.product.active ? t("inactiveBadge") : undefined}
                                editLabel={t("editProduct")}
                              />
                            </TableCell>
                            <TableCell align="right">{formatNum(item.product.price)}</TableCell>
                            <TableCell align="right">{formatNum(item.product.cost_purchase)}</TableCell>
                            <TableCell align="right" sx={{ minWidth: 110 }}>
                              <TextField
                                size="small"
                                value={draft.margin}
                                onChange={(e) => setMargin(item.product_id, e.target.value)}
                                disabled={saving}
                                slotProps={{ htmlInput: { inputMode: "decimal" } }}
                                sx={{ width: 100 }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ minWidth: 110 }}>
                              <TextField
                                size="small"
                                value={draft.price}
                                onChange={(e) => setPrice(item.product_id, e.target.value)}
                                disabled={saving}
                                slotProps={{ htmlInput: { inputMode: "decimal" } }}
                                sx={{ width: 100 }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Switch
                                checked={draft.visible_vitrine}
                                onChange={(_, checked) =>
                                  setPrixDrafts((prev) => ({
                                    ...prev,
                                    [item.product_id]: {
                                      ...(prev[item.product_id] ?? draft),
                                      visible_vitrine: checked,
                                    },
                                  }))
                                }
                                disabled={saving}
                                color="success"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Paper>

            {/* Activation */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "rgba(255,255,255,0.95)",
              }}
            >
              <Stack spacing={1.5} className="!mb-2">
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("activationSection")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("activationHint")}
                  </Typography>
                </Box>
                <SelectionToolbar
                  selectedCount={selectedActivation.size}
                  total={activationItems.length}
                  allSelected={
                    activationItems.length > 0 && selectedActivation.size === activationItems.length
                  }
                  someSelected={selectedActivation.size > 0}
                  onToggleAll={() =>
                    setAllInSet(
                      setSelectedActivation,
                      actIds,
                      selectedActivation.size !== activationItems.length,
                    )
                  }
                  onValidate={() =>
                    void validateFlags("activation", [...selectedActivation], activationDrafts)
                  }
                  onDismiss={() => void dismiss("activation", [...selectedActivation])}
                  disabled={saving}
                  t={t}
                />
              </Stack>

              {activationItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("activationEmpty")}
                </Typography>
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={
                              activationItems.length > 0 &&
                              selectedActivation.size === activationItems.length
                            }
                            indeterminate={
                              selectedActivation.size > 0 &&
                              selectedActivation.size < activationItems.length
                            }
                            onChange={() =>
                              setAllInSet(
                                setSelectedActivation,
                                actIds,
                                selectedActivation.size !== activationItems.length,
                              )
                            }
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell>{t("columns.product")}</TableCell>
                        <TableCell align="center">{t("columns.active")}</TableCell>
                        <TableCell align="center">{t("columns.vitrine")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activationItems.map((item) => {
                        const draft = activationDrafts[item.product_id] ?? {
                          active: true,
                          visible_vitrine: false,
                        };
                        return (
                          <TableRow
                            key={item.product_id}
                            hover
                            selected={selectedActivation.has(item.product_id)}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={selectedActivation.has(item.product_id)}
                                onChange={() => toggleInSet(setSelectedActivation, item.product_id)}
                                disabled={saving}
                              />
                            </TableCell>
                            <TableCell>
                              <ProductNameCell
                                name={item.product.name}
                                code={item.product.code}
                                productId={item.product_id}
                                editLabel={t("editProduct")}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Switch
                                checked={draft.active}
                                onChange={(_, checked) =>
                                  setActivationDrafts((prev) => ({
                                    ...prev,
                                    [item.product_id]: {
                                      ...(prev[item.product_id] ?? draft),
                                      active: checked,
                                    },
                                  }))
                                }
                                disabled={saving}
                                color="success"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Switch
                                checked={draft.visible_vitrine}
                                onChange={(_, checked) =>
                                  setActivationDrafts((prev) => ({
                                    ...prev,
                                    [item.product_id]: {
                                      ...(prev[item.product_id] ?? draft),
                                      visible_vitrine: checked,
                                    },
                                  }))
                                }
                                disabled={saving}
                                color="success"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Paper>

            {/* Désactivation */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "rgba(255,255,255,0.95)",
              }}
            >
              <Stack spacing={1.5} className="!mb-2">
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t("desactSection")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("desactHint")}
                  </Typography>
                </Box>
                <SelectionToolbar
                  selectedCount={selectedDesact.size}
                  total={desactItems.length}
                  allSelected={desactItems.length > 0 && selectedDesact.size === desactItems.length}
                  someSelected={selectedDesact.size > 0}
                  onToggleAll={() =>
                    setAllInSet(
                      setSelectedDesact,
                      desactIds,
                      selectedDesact.size !== desactItems.length,
                    )
                  }
                  onValidate={() =>
                    void validateFlags("desactivation", [...selectedDesact], desactDrafts)
                  }
                  onDismiss={() => void dismiss("desactivation", [...selectedDesact])}
                  disabled={saving}
                  t={t}
                />
              </Stack>

              {desactItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("desactEmpty")}
                </Typography>
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={
                              desactItems.length > 0 && selectedDesact.size === desactItems.length
                            }
                            indeterminate={
                              selectedDesact.size > 0 && selectedDesact.size < desactItems.length
                            }
                            onChange={() =>
                              setAllInSet(
                                setSelectedDesact,
                                desactIds,
                                selectedDesact.size !== desactItems.length,
                              )
                            }
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell>{t("columns.product")}</TableCell>
                        <TableCell align="center">{t("columns.active")}</TableCell>
                        <TableCell align="center">{t("columns.vitrine")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {desactItems.map((item) => {
                        const draft = desactDrafts[item.product_id] ?? {
                          active: false,
                          visible_vitrine: false,
                        };
                        return (
                          <TableRow
                            key={item.product_id}
                            hover
                            selected={selectedDesact.has(item.product_id)}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={selectedDesact.has(item.product_id)}
                                onChange={() => toggleInSet(setSelectedDesact, item.product_id)}
                                disabled={saving}
                              />
                            </TableCell>
                            <TableCell>
                              <ProductNameCell
                                name={item.product.name}
                                code={item.product.code}
                                productId={item.product_id}
                                editLabel={t("editProduct")}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Switch
                                checked={draft.active}
                                onChange={(_, checked) =>
                                  setDesactDrafts((prev) => ({
                                    ...prev,
                                    [item.product_id]: {
                                      ...(prev[item.product_id] ?? draft),
                                      active: checked,
                                    },
                                  }))
                                }
                                disabled={saving}
                                color="success"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Switch
                                checked={draft.visible_vitrine}
                                onChange={(_, checked) =>
                                  setDesactDrafts((prev) => ({
                                    ...prev,
                                    [item.product_id]: {
                                      ...(prev[item.product_id] ?? draft),
                                      visible_vitrine: checked,
                                    },
                                  }))
                                }
                                disabled={saving}
                                color="success"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Paper>
          </Stack>
        )}
      </div>
    </div>
  );
}
