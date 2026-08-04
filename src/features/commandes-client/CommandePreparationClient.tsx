"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import CommandeClientLinesEditor from "@/features/commandes-client/CommandeClientLinesEditor";
import CommandePreparationLines from "@/features/commandes-client/CommandePreparationLines";
import { formatDh, workflowStatusLabel } from "@/features/commandes-client/workflow-labels";
import type { CategoryMeta } from "@/lib/commandes-client/group-workflow-lines-by-category";
import { commandeWorkflowLineKey } from "@/lib/commandes-client/group-workflow-lines-by-category";
import type { CommandeClientDetail } from "@/lib/commandes-client/queries";
import {
  allLinesPreparationMarked,
  applyLinePreparationStatus,
  isLinePreparationMarked,
  type LinePreparationStatus,
  type ShopCartWorkflowLine,
} from "@/lib/commandes-client/workflow";
import type { ShopProduct } from "@/lib/shop/types";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

function lineKey(line: ShopCartWorkflowLine): string {
  return encodeURIComponent(`${line.productId}__${line.shopOrderUnitId ?? "default"}`);
}

type Props = { cartId: string };

export default function CommandePreparationClient({ cartId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.commandesClient.preparation");
  const tDetail = useTranslations("backoffice.commandesClient.detail");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [commande, setCommande] = useState<CommandeClientDetail | null>(null);
  const [productById, setProductById] = useState<Map<string, ShopProduct>>(new Map());
  const [categoryMeta, setCategoryMeta] = useState<Map<string, CategoryMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [preparationComment, setPreparationComment] = useState("");
  const [confirmMissingOpen, setConfirmMissingOpen] = useState(false);

  useEffect(() => {
    if (!permLoading && !can("commandes_client.prepare")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/commandes-client/${encodeURIComponent(cartId)}`);
      const json = (await res.json()) as { commande?: CommandeClientDetail; error?: string };
      if (!res.ok || !json.commande) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setCommande(json.commande);
      setPreparationComment(json.commande.preparation_comment?.trim() ?? "");
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [cartId, tCommon]);

  useEffect(() => {
    if (!permLoading && can("commandes_client.prepare")) void load();
  }, [permLoading, can, load]);

  useEffect(() => {
    if (!commande) return;
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
  }, [commande, cartId]);

  const markedCount = useMemo(
    () => commande?.lines.filter(isLinePreparationMarked).length ?? 0,
    [commande?.lines],
  );
  const lineCount = commande?.lines.length ?? 0;
  const progress = lineCount > 0 ? (markedCount / lineCount) * 100 : 0;

  const isOverview = commande?.workflow_status === "a_preparer";
  const isActivePrep = commande?.workflow_status === "en_preparation";
  const wrongStatus = !isOverview && !isActivePrep;

  const setLineStatus = async (line: ShopCartWorkflowLine, status: LinePreparationStatus) => {
    const key = commandeWorkflowLineKey(line);
    setTogglingKey(key);
    setErr(null);
    try {
      const res = await fetch(
        `/api/commandes-client/${encodeURIComponent(cartId)}/lines/${lineKey(line)}/prepared`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setCommande((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) =>
            commandeWorkflowLineKey(l) === key ? applyLinePreparationStatus(l, status) : l,
          ),
        };
      });
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setTogglingKey(null);
    }
  };

  const startPreparation = async () => {
    setStarting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/commandes-client/${encodeURIComponent(cartId)}/start-preparation`,
        { method: "POST" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      await load();
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setStarting(false);
    }
  };

  const finishPreparation = async (markMissingUnavailable: boolean) => {
    setFinishing(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/commandes-client/${encodeURIComponent(cartId)}/finish-preparation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preparationComment,
            markMissingUnavailable,
          }),
        },
      );
      const json = (await res.json()) as { error?: string; lines?: ShopCartWorkflowLine[] };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      if (markMissingUnavailable && json.lines) {
        setCommande((prev) => (prev ? { ...prev, lines: json.lines ?? prev.lines } : prev));
      }
      void router.push("/commandes-client/preparation");
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setFinishing(false);
      setConfirmMissingOpen(false);
    }
  };

  const handleFinishClick = () => {
    if (!commande) return;
    if (allLinesPreparationMarked(commande.lines)) {
      void finishPreparation(false);
      return;
    }
    setConfirmMissingOpen(true);
  };

  if (permLoading || loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!commande) {
    return <Alert severity="error">{err ?? tCommon("error")}</Alert>;
  }

  const unmarkedCount = lineCount - markedCount;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: 2 }}>
      <Button
        component={AppLink}
        href="/commandes-client/preparation"
        startIcon={<BackChevron />}
        sx={{ mb: 1 }}
      >
        {t("back")}
      </Button>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, mb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          #{commande.cart_number}
        </Typography>
        <Chip size="small" label={workflowStatusLabel(commande.workflow_status)} />
        {can("commandes_client.read") ? (
          <Button component={AppLink} href={`/commandes-client/${cartId}`} size="small" variant="outlined">
            {t("viewOrder")}
          </Button>
        ) : null}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
        <Chip size="small" label={commande.client_nom?.trim() || t("noClient")} />
        {commande.magasin_nom ? (
          <Chip size="small" variant="outlined" label={`${commande.magasin_nom} (${commande.magasin_code})`} />
        ) : null}
        {commande.fulfillment_mode === "home" ? (
          <Chip size="small" color="info" variant="outlined" label={tDetail("home")} />
        ) : commande.fulfillment_mode === "pickup" ? (
          <Chip size="small" color="info" variant="outlined" label={tDetail("pickup")} />
        ) : null}
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {commande.pos_total != null
          ? `${tDetail("posTotal")} : ${formatDh(commande.pos_total)} DH`
          : `${t("estimate")} : ${formatDh(commande.montant_total)} DH`}
      </Typography>

      {wrongStatus ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("wrongStatus")}
        </Alert>
      ) : null}

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {commande.order_comment?.trim() ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            {tDetail("orderComment")}
          </Typography>
          <Typography variant="body2">{commande.order_comment.trim()}</Typography>
        </Paper>
      ) : null}

      {isOverview ? (
        <>
          <CommandeClientLinesEditor
            lines={commande.lines}
            productById={productById}
            categoryMeta={categoryMeta}
            onChange={() => {}}
            onAddProduct={() => {}}
            readOnly
          />
          <Button
            sx={{ mt: 2 }}
            variant="contained"
            fullWidth
            disabled={starting || lineCount === 0 || wrongStatus}
            onClick={() => void startPreparation()}
          >
            {starting ? tCommon("loading") : t("startPreparation")}
          </Button>
        </>
      ) : null}

      {isActivePrep ? (
        <>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {t("progress", { done: markedCount, total: lineCount })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round(progress)} %
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 1 }} />
          </Paper>

          <CommandePreparationLines
            lines={commande.lines}
            productById={productById}
            categoryMeta={categoryMeta}
            togglingKey={togglingKey}
            onLineStatus={(line, status) => void setLineStatus(line, status)}
          />

          <TextField
            label={t("preparationComment")}
            value={preparationComment}
            onChange={(e) => setPreparationComment(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            placeholder={t("preparationCommentPlaceholder")}
          />

          <Button
            sx={{ mt: 2 }}
            variant="contained"
            fullWidth
            disabled={finishing || lineCount === 0}
            onClick={handleFinishClick}
          >
            {finishing ? tCommon("loading") : t("finish")}
          </Button>
        </>
      ) : null}

      <Dialog open={confirmMissingOpen} onClose={() => setConfirmMissingOpen(false)}>
        <DialogTitle>{t("confirmMissingTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("confirmMissingBody", { count: unmarkedCount })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmMissingOpen(false)}>{t("confirmMissingBack")}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={finishing}
            onClick={() => void finishPreparation(true)}
          >
            {finishing ? tCommon("loading") : t("confirmMissingConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
