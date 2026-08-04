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
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import AppLink from "@/components/AppLink";
import CommandeClientLinesEditor from "@/features/commandes-client/CommandeClientLinesEditor";
import TicketRefCameraScannerDialog, {
  isCameraScanSupported,
} from "@/features/commandes-client/TicketRefCameraScannerDialog";
import FormDialog from "@/lib/mui/FormDialog";
import { formatDh, workflowStatusLabel } from "@/features/commandes-client/workflow-labels";
import type { CategoryMeta } from "@/lib/commandes-client/group-workflow-lines-by-category";
import type { CommandeClientDetail, CommandeClientListItem } from "@/lib/commandes-client/queries";
import {
  defaultConfirmedPaymentForDelivery,
  type ConfirmedPaymentMethod,
} from "@/lib/commandes-client/workflow";
import type { ShopProduct } from "@/lib/shop/types";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

function displayTotal(item: CommandeClientListItem): number {
  return item.pos_total ?? item.montant_total ?? 0;
}

export default function CommandeLivraisonClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandesClient.livraison");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can, linkedMagasins } = useSessionPermissions();

  const [items, setItems] = useState<CommandeClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [scanRef, setScanRef] = useState("");
  const [confirmItem, setConfirmItem] = useState<CommandeClientListItem | null>(null);
  const [payment, setPayment] = useState<ConfirmedPaymentMethod>("card");
  const [showLines, setShowLines] = useState(false);
  const [detailCommande, setDetailCommande] = useState<CommandeClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [productById, setProductById] = useState<Map<string, ShopProduct>>(new Map());
  const [categoryMeta, setCategoryMeta] = useState<Map<string, CategoryMeta>>(new Map());
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);

  useEffect(() => {
    setCameraSupported(isCameraScanSupported());
  }, []);

  useEffect(() => {
    if (!permLoading && !can("commandes_client.deliver")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workflow_status: "a_livrer,en_livraison" });
      if (linkedMagasins.length === 1) params.set("magasin_id", linkedMagasins[0].id);
      const res = await fetch(`/api/commandes-client?${params}`);
      const json = (await res.json()) as { commandes?: CommandeClientListItem[]; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setItems(json.commandes ?? []);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [linkedMagasins, tCommon]);

  useEffect(() => {
    if (!permLoading && can("commandes_client.deliver")) void load();
  }, [permLoading, can, load]);

  const openConfirm = useCallback((item: CommandeClientListItem) => {
    setConfirmItem(item);
    setPayment(defaultConfirmedPaymentForDelivery(item.payment_method));
    setShowLines(false);
    setDetailCommande(null);
    setDetailErr(null);
    setProductById(new Map());
    setCategoryMeta(new Map());
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmItem(null);
    setShowLines(false);
    setDetailCommande(null);
    setDetailErr(null);
  }, []);

  const loadDetail = useCallback(async (cartId: string) => {
    setDetailLoading(true);
    setDetailErr(null);
    try {
      const res = await fetch(`/api/commandes-client/${encodeURIComponent(cartId)}`);
      const json = (await res.json()) as { commande?: CommandeClientDetail; error?: string };
      if (!res.ok || !json.commande) {
        setDetailErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setDetailCommande(json.commande);

      const lineProductIds = [...new Set(json.commande.lines.map((line) => line.productId))];
      const qs =
        lineProductIds.length > 0
          ? `?includeIds=${lineProductIds.map((id) => encodeURIComponent(id)).join(",")}`
          : "";
      const catalogRes = await fetch(`/api/commandes-client/shop-catalog${qs}`);
      const catalogJson = (await catalogRes.json()) as {
        products?: ShopProduct[];
        categories?: Array<{ id: string; label: string; sortOrder: number }>;
      };
      if (catalogRes.ok) {
        const map = new Map<string, ShopProduct>();
        for (const p of catalogJson.products ?? []) {
          map.set(p.id, p);
        }
        setProductById(map);
        const catMap = new Map<string, CategoryMeta>();
        for (const c of catalogJson.categories ?? []) {
          catMap.set(c.id, { label: c.label, sortOrder: c.sortOrder });
        }
        setCategoryMeta(catMap);
      }
    } catch {
      setDetailErr(tCommon("networkError"));
    } finally {
      setDetailLoading(false);
    }
  }, [tCommon]);

  const openLines = useCallback(() => {
    if (!confirmItem) return;
    setShowLines(true);
    if (detailCommande?.id !== confirmItem.id) {
      void loadDetail(confirmItem.id);
    }
  }, [confirmItem, detailCommande?.id, loadDetail]);

  const handleScan = useCallback(
    async (refOverride?: string) => {
      const ticketRef = (refOverride ?? scanRef).trim();
      if (!ticketRef) return;
      setErr(null);
      try {
        const res = await fetch("/api/commandes-client/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketRef }),
        });
        const json = (await res.json()) as {
          commande?: CommandeClientListItem;
          error?: string;
        };
        if (!res.ok) {
          setErr(typeof json.error === "string" ? json.error : tCommon("error"));
          return;
        }
        setScanRef("");
        setCameraOpen(false);
        await load();
        if (json.commande) {
          openConfirm(json.commande);
        }
      } catch {
        setErr(tCommon("networkError"));
      }
    },
    [scanRef, load, openConfirm, tCommon],
  );

  const handleCameraDetected = useCallback(
    (ticketRef: string) => {
      setScanRef(ticketRef);
      void handleScan(ticketRef);
    },
    [handleScan],
  );

  const handleConfirm = async () => {
    if (!confirmItem) return;
    const isPaid = confirmItem.payment_status === "paid";
    const body = isPaid ? {} : { payment };

    try {
      const res = await fetch(
        `/api/commandes-client/${encodeURIComponent(confirmItem.id)}/confirm-delivery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      closeConfirm();
      await load();
    } catch {
      setErr(tCommon("networkError"));
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", p: 2 }}>
      <Button component={AppLink} href="/commandes-client" startIcon={<BackChevron />} sx={{ mb: 1 }}>
        {t("back")}
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t("title")}
      </Typography>
      <Stack spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label={t("scanLabel")}
            value={scanRef}
            onChange={(e) => setScanRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleScan();
            }}
            fullWidth
          />
          <Button variant="contained" onClick={() => void handleScan()}>
            {t("scan")}
          </Button>
        </Stack>
        {cameraSupported ? (
          <Button
            variant="outlined"
            startIcon={<PhotoCameraOutlinedIcon />}
            onClick={() => setCameraOpen(true)}
            fullWidth
          >
            {t("scanCamera")}
          </Button>
        ) : null}
      </Stack>
      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}
      {loading ? (
        <CircularProgress />
      ) : (
        <List component={Paper}>
          {items.map((c) => (
            <ListItem key={c.id} divider>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <span>#{c.cart_number}</span>
                    <Chip size="small" label={workflowStatusLabel(c.workflow_status)} />
                    {c.payment_status === "paid" ? (
                      <Chip size="small" color="success" label={t("paid")} />
                    ) : null}
                  </Stack>
                }
                secondary={`${c.client_nom ?? "—"} · ${formatDh(displayTotal(c))} DH`}
              />
              {c.workflow_status === "en_livraison" ? (
                <Button size="small" variant="outlined" onClick={() => openConfirm(c)}>
                  {t("confirm")}
                </Button>
              ) : null}
            </ListItem>
          ))}
        </List>
      )}

      <FormDialog
        open={confirmItem != null}
        onClose={closeConfirm}
        maxWidth={showLines ? "md" : "sm"}
        fullWidth
      >
        <DialogTitle>
          {showLines
            ? t("detailTitle", { number: confirmItem?.cart_number ?? "" })
            : t("confirmTitle")}
        </DialogTitle>
        <DialogContent dividers={showLines}>
          {showLines ? (
            detailLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : detailErr ? (
              <Alert severity="error">{detailErr}</Alert>
            ) : detailCommande ? (
              <Stack spacing={2}>
                {detailCommande.order_comment?.trim() ? (
                  <Typography variant="body2" color="text.secondary">
                    {detailCommande.order_comment.trim()}
                  </Typography>
                ) : null}
                <CommandeClientLinesEditor
                  lines={detailCommande.lines}
                  productById={productById}
                  categoryMeta={categoryMeta}
                  onChange={() => {}}
                  onAddProduct={() => {}}
                  readOnly
                />
              </Stack>
            ) : null
          ) : confirmItem ? (
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              <Typography variant="body2">
                {t("orderNumber")} : #{confirmItem.cart_number}
              </Typography>
              <Typography variant="body2">
                {t("client")} : {confirmItem.client_nom ?? "—"}
              </Typography>
              <Typography variant="body2">
                {t("total")} : {formatDh(displayTotal(confirmItem))} DH
              </Typography>
              {confirmItem.payment_status === "paid" ? (
                <Typography>{t("alreadyPaid")}</Typography>
              ) : (
                <TextField
                  select
                  fullWidth
                  label={t("payment")}
                  value={payment}
                  onChange={(e) => setPayment(e.target.value as ConfirmedPaymentMethod)}
                >
                  <MenuItem value="card">{t("card")}</MenuItem>
                  <MenuItem value="cash">{t("cash")}</MenuItem>
                  <MenuItem value="none">{t("none")}</MenuItem>
                </TextField>
              )}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 2 }}>
          {showLines ? (
            <>
              <Button onClick={() => setShowLines(false)} sx={{ mr: "auto" }}>
                {t("backToConfirm")}
              </Button>
              <Button onClick={closeConfirm}>{tCommon("cancel")}</Button>
              <Button variant="contained" onClick={() => void handleConfirm()}>
                {t("confirm")}
              </Button>
            </>
          ) : (
            <>
              {confirmItem ? (
                <Button onClick={openLines} sx={{ mr: "auto" }}>
                  {t("viewDetail")}
                </Button>
              ) : null}
              <Button onClick={closeConfirm}>{tCommon("cancel")}</Button>
              <Button variant="contained" onClick={() => void handleConfirm()}>
                {t("confirm")}
              </Button>
            </>
          )}
        </DialogActions>
      </FormDialog>

      <TicketRefCameraScannerDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={handleCameraDetected}
        title={t("cameraTitle")}
        hint={t("cameraHint")}
        closeLabel={tCommon("close")}
        invalidCode={t("cameraInvalidCode")}
        cameraDenied={t("cameraDenied")}
        cameraUnavailable={t("cameraUnavailable")}
      />
    </Box>
  );
}
