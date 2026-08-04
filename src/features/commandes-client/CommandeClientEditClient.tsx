"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import FormDialog from "@/lib/mui/FormDialog";
import CommandeClientLinkDialog from "@/features/commandes-client/CommandeClientLinkDialog";
import CommandeClientLinesEditor, {
  mergeWorkflowLine,
} from "@/features/commandes-client/CommandeClientLinesEditor";
import type { CategoryMeta } from "@/lib/commandes-client/group-workflow-lines-by-category";
import CommandeClientProductPicker from "@/features/commandes-client/CommandeClientProductPicker";
import {
  formatDh,
  workflowStatusLabel,
} from "@/features/commandes-client/workflow-labels";
import type { CommandeClientDetail, WorkflowLogEntry } from "@/lib/commandes-client/queries";
import type { ShopCartWorkflowLine } from "@/lib/commandes-client/workflow";
import type { ShopProduct } from "@/lib/shop/types";
import {
  resolveDefaultMagasinId,
  type MagasinOption,
} from "@/lib/commandes-client/default-magasin";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type Props = { cartId: string };

export default function CommandeClientEditClient({ cartId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.commandesClient.detail");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [commande, setCommande] = useState<CommandeClientDetail | null>(null);
  const [log, setLog] = useState<WorkflowLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderComment, setOrderComment] = useState("");
  const [fulfillmentMode, setFulfillmentMode] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [magasinId, setMagasinId] = useState("");
  const [magasins, setMagasins] = useState<MagasinOption[]>([]);
  const [magasinInitialized, setMagasinInitialized] = useState(false);
  const [linkClientOpen, setLinkClientOpen] = useState(false);
  const [draftLines, setDraftLines] = useState<ShopCartWorkflowLine[]>([]);
  const [productById, setProductById] = useState<Map<string, ShopProduct>>(new Map());
  const [categoryMeta, setCategoryMeta] = useState<Map<string, CategoryMeta>>(new Map());
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  useEffect(() => {
    if (!permLoading && !can("commandes_client.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/commandes-client/${encodeURIComponent(cartId)}`);
      const json = (await res.json()) as {
        commande?: CommandeClientDetail;
        log?: WorkflowLogEntry[];
        error?: string;
      };
      if (!res.ok || !json.commande) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setCommande(json.commande);
      setLog(json.log ?? []);
      setDraftLines(json.commande.lines.map((line) => ({ ...line })));
      setOrderComment(json.commande.order_comment ?? "");
      setFulfillmentMode(json.commande.fulfillment_mode ?? "");
      setPaymentMethod(json.commande.payment_method ?? "");
      setMagasinId(json.commande.magasin_id ?? "");
      setMagasinInitialized(false);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [cartId, tCommon]);

  useEffect(() => {
    if (!permLoading && can("commandes_client.read")) void load();
  }, [permLoading, can, load]);

  useEffect(() => {
    if (!can("commandes_client.read")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/commandes-client/magasins");
        const json = (await res.json()) as { magasins?: MagasinOption[] };
        if (!res.ok || cancelled) return;
        setMagasins(json.magasins ?? []);
      } catch {
        if (!cancelled) setMagasins([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [can]);

  useEffect(() => {
    if (magasinInitialized || magasins.length === 0 || !commande) return;
    setMagasinId((prev) => resolveDefaultMagasinId(magasins, prev || commande.magasin_id));
    setMagasinInitialized(true);
  }, [magasins, commande, magasinInitialized]);

  const canEditBeforeValidate =
    can("commandes_client.validate") &&
    (commande?.workflow_status === "nouvelle" || commande?.workflow_status === "a_valider");

  useEffect(() => {
    if (permLoading || !can("commandes_client.read") || !commande) return;
    let cancelled = false;
    const lineProductIds = [...new Set(commande.lines.map((line) => line.productId))];
    const qs =
      lineProductIds.length > 0
        ? `?includeIds=${lineProductIds.map((id) => encodeURIComponent(id)).join(",")}`
        : "";
    void (async () => {
      try {
        const res = await fetch(`/api/commandes-client/shop-catalog${qs}`);
        const json = (await res.json()) as {
          products?: ShopProduct[];
          categories?: Array<{ id: string; label: string; sortOrder: number }>;
        };
        if (!res.ok || cancelled) return;
        const map = new Map<string, ShopProduct>();
        for (const p of json.products ?? []) {
          map.set(p.id, p);
        }
        setProductById(map);
        const catMap = new Map<string, CategoryMeta>();
        for (const c of json.categories ?? []) {
          catMap.set(c.id, { label: c.label, sortOrder: c.sortOrder });
        }
        setCategoryMeta(catMap);
      } catch {
        if (!cancelled) {
          setProductById(new Map());
          setCategoryMeta(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permLoading, can, commande, cartId]);

  const serializeLines = (lines: ShopCartWorkflowLine[]) =>
    lines.map((line) => ({
      productId: line.productId,
      shopOrderUnitId: line.shopOrderUnitId,
      qty: line.qty,
      unitCode: line.unitCode,
      unitLabel: line.unitLabel,
      priceAtAdd: line.priceAtAdd,
      equivKgAtAdd: line.equivKgAtAdd,
      canonicalKg: line.canonicalKg ?? null,
      comment: line.comment ?? null,
    }));

  const handleSaveOrder = () => {
    if (draftLines.length === 0) {
      setErr(t("emptyLines"));
      return;
    }
    void savePatch({
      order_comment: orderComment,
      fulfillment_mode: fulfillmentMode || null,
      payment_method: paymentMethod || null,
      magasin_id: magasinId || null,
      lines: serializeLines(draftLines),
    });
  };

  const savePatch = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/commandes-client/${encodeURIComponent(cartId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return false;
      }
      await load();
      return true;
    } catch {
      setErr(tCommon("networkError"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (!commande?.client_id) {
      setErr(t("clientRequired"));
      return;
    }
    if (!magasinId) {
      setErr(t("magasinRequired"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-client/${encodeURIComponent(cartId)}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magasin_id: magasinId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      await load();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/commandes-client/${encodeURIComponent(cartId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setCancelOpen(false);
      await load();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  };

  if (permLoading || loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!commande) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{err ?? tCommon("error")}</Alert>
      </Box>
    );
  }

  const canValidate = commande.workflow_status === "a_valider" && can("commandes_client.validate");
  const canCancel =
    can("commandes_client.validate") &&
    commande.workflow_status != null &&
    [
      "nouvelle",
      "a_valider",
      "a_preparer",
      "en_preparation",
      "a_passer_caisse",
      "en_cours_caisse",
      "en_attente_caisse",
    ].includes(commande.workflow_status);
  const canLinkClient =
    can("commandes_client.validate") &&
    (commande.workflow_status === "nouvelle" || commande.workflow_status === "a_valider");

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", p: 2 }}>
      <Button component={AppLink} href="/commandes-client" startIcon={<BackChevron />} sx={{ mb: 1 }}>
        {t("backList")}
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {t("title", { number: commande.cart_number })}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ my: 1, flexWrap: "wrap" }}>
        <Chip label={workflowStatusLabel(commande.workflow_status)} />
        {commande.payment_status === "paid" ? (
          <Chip color="success" label={t("paid")} />
        ) : (
          <Chip label={t("unpaid")} />
        )}
      </Stack>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t("client")}
            </Typography>
            {commande.client_id && commande.client_nom ? (
              <Typography sx={{ fontWeight: 600 }}>{commande.client_nom}</Typography>
            ) : (
              <Typography color="warning.dark" sx={{ fontWeight: 600 }}>
                {t("noClient")}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {commande.client_id ? (
              <Button
                component={AppLink}
                href={`/clients/${encodeURIComponent(commande.client_id)}`}
                size="small"
                variant="outlined"
                sx={{ textTransform: "none" }}
              >
                {t("clientAccount")}
              </Button>
            ) : null}
            {canLinkClient ? (
              <Button
                size="small"
                variant={commande.client_id ? "outlined" : "contained"}
                color="success"
                onClick={() => setLinkClientOpen(true)}
                sx={{ textTransform: "none" }}
              >
                {commande.client_id ? t("changeClient") : t("linkClient")}
              </Button>
            ) : null}
          </Stack>
        </Stack>
        {!commande.client_id && canLinkClient ? (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {t("linkClientHint")}
          </Alert>
        ) : null}
      </Paper>

      {commande.pos_total != null ? (
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t("posTotal")}: {formatDh(commande.pos_total)} DH
        </Typography>
      ) : null}

      {canEditBeforeValidate ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            {t("editSection")}
          </Typography>
          <Stack spacing={2}>
            <TextField
              select
              label={t("fulfillment")}
              value={fulfillmentMode}
              onChange={(e) => setFulfillmentMode(e.target.value)}
              fullWidth
            >
              <MenuItem value="">{tCommon("emDash")}</MenuItem>
              <MenuItem value="pickup">{t("pickup")}</MenuItem>
              <MenuItem value="home">{t("home")}</MenuItem>
            </TextField>
            <TextField
              select
              label={t("paymentWanted")}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              fullWidth
            >
              <MenuItem value="">{tCommon("emDash")}</MenuItem>
              <MenuItem value="cash">{t("cash")}</MenuItem>
              <MenuItem value="card">{t("card")}</MenuItem>
            </TextField>
            <TextField
              select
              label={t("magasin")}
              value={magasinId}
              onChange={(e) => setMagasinId(e.target.value)}
              fullWidth
              required
              error={!magasinId}
              helperText={!magasinId ? t("magasinRequired") : undefined}
            >
              {magasins.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.nom} ({m.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={t("orderComment")}
              value={orderComment}
              onChange={(e) => setOrderComment(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </Paper>
      ) : null}

      <CommandeClientLinesEditor
        lines={canEditBeforeValidate ? draftLines : commande.lines}
        productById={productById}
        categoryMeta={categoryMeta}
        onChange={setDraftLines}
        onAddProduct={() => setProductPickerOpen(true)}
        readOnly={!canEditBeforeValidate}
      />

      {canEditBeforeValidate ? (
        <Button
          variant="outlined"
          onClick={() => void handleSaveOrder()}
          disabled={saving}
          sx={{ mb: 3, textTransform: "none" }}
        >
          {saving ? tCommon("saving") : t("saveOrder")}
        </Button>
      ) : null}

      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap" }}>
        {canValidate ? (
          <Button
            variant="contained"
            onClick={() => void handleValidate()}
            disabled={saving || !commande.client_id || !magasinId}
          >
            {t("validate")}
          </Button>
        ) : null}
        {canCancel ? (
          <Button color="error" variant="outlined" onClick={() => setCancelOpen(true)} disabled={saving}>
            {t("cancel")}
          </Button>
        ) : null}
      </Stack>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {t("logTitle")}
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        {log.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("logEmpty")}
          </Typography>
        ) : (
          log.map((entry) => (
            <Typography key={entry.id} variant="caption" sx={{ display: "block" }} color="text.secondary">
              {new Date(entry.created_at).toLocaleString("fr-FR")} — {entry.action}
              {entry.from_status || entry.to_status
                ? ` (${entry.from_status ?? "?"} → ${entry.to_status ?? "?"})`
                : ""}
              {entry.comment ? `: ${entry.comment}` : ""}
            </Typography>
          ))
        )}
      </Stack>

      <FormDialog open={cancelOpen} onClose={() => !saving && setCancelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("cancelTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            label={t("cancelReason")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            required
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)} disabled={saving}>
            {tCommon("cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={saving || !cancelReason.trim()}
            onClick={() => void handleCancel()}
          >
            {t("confirmCancel")}
          </Button>
        </DialogActions>
      </FormDialog>

      <CommandeClientLinkDialog
        open={linkClientOpen}
        cartId={cartId}
        cartNumber={commande.cart_number}
        onClose={() => setLinkClientOpen(false)}
        onSaved={() => {
          setLinkClientOpen(false);
          void load();
        }}
      />

      <CommandeClientProductPicker
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onAdd={(line) => setDraftLines((prev) => mergeWorkflowLine(prev, line))}
      />
    </Box>
  );
}
