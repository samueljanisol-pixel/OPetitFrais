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
import { formatDh, displayCommandeTotal, workflowStatusLabel } from "@/features/commandes-client/workflow-labels";
import type { CommandeClientListItem } from "@/lib/commandes-client/queries";
import type { ConfirmedPaymentMethod } from "@/lib/commandes-client/workflow";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

export default function CommandeRetraitClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandesClient.retrait");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can, linkedMagasins } = useSessionPermissions();

  const [items, setItems] = useState<CommandeClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<CommandeClientListItem | null>(null);
  const [payment, setPayment] = useState<ConfirmedPaymentMethod>("card");

  useEffect(() => {
    if (!permLoading && !can("commandes_client.deliver")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workflow_status: "a_retirer" });
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

  const handleConfirm = async () => {
    if (!confirmItem) return;
    const isPaid = confirmItem.payment_status === "paid";
    const body = isPaid ? {} : { payment };
    try {
      const res = await fetch(
        `/api/commandes-client/${encodeURIComponent(confirmItem.id)}/confirm-pickup`,
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
      {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
      {loading ? (
        <CircularProgress />
      ) : items.length === 0 ? (
        <Typography color="text.secondary">{t("empty")}</Typography>
      ) : (
        <List component={Paper}>
          {items.map((c) => (
            <ListItem key={c.id} divider>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1}>
                    <span>#{c.cart_number}</span>
                    <Chip size="small" label={workflowStatusLabel(c.workflow_status)} />
                    {c.payment_status === "paid" ? (
                      <Chip size="small" color="success" label={t("paid")} />
                    ) : null}
                  </Stack>
                }
                secondary={`${c.client_nom ?? "—"} · ${formatDh(displayCommandeTotal(c))} DH`}
              />
              <Button size="small" variant="outlined" onClick={() => setConfirmItem(c)}>
                {t("confirm")}
              </Button>
            </ListItem>
          ))}
        </List>
      )}

      <FormDialog open={confirmItem != null} onClose={() => setConfirmItem(null)} maxWidth="sm" fullWidth>
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
              <MenuItem value="credit">{t("credit")}</MenuItem>
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmItem(null)}>{tCommon("cancel")}</Button>
          <Button variant="contained" onClick={() => void handleConfirm()}>
            {t("confirm")}
          </Button>
        </DialogActions>
      </FormDialog>
    </Box>
  );
}
