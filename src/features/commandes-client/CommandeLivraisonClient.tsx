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
import AppLink from "@/components/AppLink";
import FormDialog from "@/lib/mui/FormDialog";
import { formatDh, workflowStatusLabel } from "@/features/commandes-client/workflow-labels";
import type { CommandeClientListItem } from "@/lib/commandes-client/queries";
import type { ConfirmedPaymentMethod } from "@/lib/commandes-client/workflow";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [payment, setPayment] = useState<ConfirmedPaymentMethod>("card");
  const [confirmItem, setConfirmItem] = useState<CommandeClientListItem | null>(null);

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

  const handleScan = async () => {
    const ticketRef = scanRef.trim();
    if (!ticketRef) return;
    setErr(null);
    try {
      const res = await fetch("/api/commandes-client/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketRef }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setScanRef("");
      await load();
    } catch {
      setErr(tCommon("networkError"));
    }
  };

  const openConfirm = (item: CommandeClientListItem) => {
    setConfirmItem(item);
    setConfirmId(item.id);
  };

  const handleConfirm = async () => {
    if (!confirmId || !confirmItem) return;
    const isPaid = confirmItem.payment_status === "paid";
    const body = isPaid ? {} : { payment };
    const endpoint =
      confirmItem.workflow_status === "en_livraison"
        ? `/api/commandes-client/${encodeURIComponent(confirmId)}/confirm-delivery`
        : null;
    if (!endpoint) return;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setConfirmId(null);
      setConfirmItem(null);
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
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label={t("scanLabel")}
          value={scanRef}
          onChange={(e) => setScanRef(e.target.value)}
          fullWidth
        />
        <Button variant="contained" onClick={() => void handleScan()}>
          {t("scan")}
        </Button>
      </Stack>
      {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
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
                secondary={`${c.client_nom ?? "—"} · ${formatDh(c.montant_total)} DH`}
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
        open={confirmId != null}
        onClose={() => setConfirmId(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t("confirmTitle")}</DialogTitle>
        <DialogContent>
          {confirmItem?.payment_status === "paid" ? (
            <Typography>{t("alreadyPaid")}</Typography>
          ) : (
            <TextField
              select
              fullWidth
              label={t("payment")}
              value={payment}
              onChange={(e) => setPayment(e.target.value as ConfirmedPaymentMethod)}
              sx={{ mt: 1 }}
            >
              <MenuItem value="card">{t("card")}</MenuItem>
              <MenuItem value="cash">{t("cash")}</MenuItem>
              <MenuItem value="none">{t("none")}</MenuItem>
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmId(null)}>{tCommon("cancel")}</Button>
          <Button variant="contained" onClick={() => void handleConfirm()}>
            {t("confirm")}
          </Button>
        </DialogActions>
      </FormDialog>
    </Box>
  );
}
