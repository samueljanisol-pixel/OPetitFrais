"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type StoredLine = {
  productId?: string;
  qty?: number;
  unitLabel?: string;
  priceAtAdd?: number;
  comment?: string | null;
};

type Props = {
  clientId: string;
  cartId: string;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ClientPanierDetailClient({ clientId, cartId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.clients.panierDetail");
  const tCommon = useTranslations("common");
  const { formatDateTime } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [panier, setPanier] = useState<{
    label: string;
    montant_total: number;
    paye: boolean;
    submitted_at: string | null;
    fulfillment_mode: string | null;
    payment_method: string | null;
    order_comment: string | null;
    lines: StoredLine[];
  } | null>(null);

  useEffect(() => {
    if (!permLoading && !can("clients.read")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/clients/paniers/${encodeURIComponent(cartId)}`);
      const json = (await res.json()) as {
        panier?: {
          label: string;
          montant_total: number;
          paye: boolean;
          submitted_at: string | null;
          fulfillment_mode: string | null;
          payment_method: string | null;
          order_comment: string | null;
          lines: StoredLine[];
        };
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setPanier(json.panier ?? null);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [cartId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("clients.read")) return;
    void load();
  }, [permLoading, can, load]);

  if (permLoading || !can("clients.read")) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-slate-600">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Button
        component={AppLink}
        href={`/clients/${encodeURIComponent(clientId)}`}
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {t("back")}
      </Button>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 2 }}>
        {panier?.label ?? t("title")}
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={32} />
        </Box>
      ) : panier ? (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="body2">
              {t("submitted")} : {panier.submitted_at ? formatDateTime(panier.submitted_at) : "—"}
            </Typography>
            <Typography variant="body2">
              {t("total")} : {formatDh(panier.montant_total)} DH
            </Typography>
            <Typography variant="body2">
              {t("status")} : {panier.paye ? t("paidBadge") : t("unpaidBadge")}
            </Typography>
            {panier.fulfillment_mode ? (
              <Typography variant="body2">
                {t("fulfillment")} : {panier.fulfillment_mode}
              </Typography>
            ) : null}
            {panier.payment_method ? (
              <Typography variant="body2">
                {t("paymentPref")} : {panier.payment_method}
              </Typography>
            ) : null}
            {panier.order_comment ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {t("comment")} : {panier.order_comment}
              </Typography>
            ) : null}
          </Paper>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("product")}</TableCell>
                <TableCell align="right">{t("qty")}</TableCell>
                <TableCell align="right">{t("price")}</TableCell>
                <TableCell align="right">{t("lineTotal")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(Array.isArray(panier.lines) ? panier.lines : []).map((line, idx) => {
                const qty = typeof line.qty === "number" ? line.qty : 0;
                const price = typeof line.priceAtAdd === "number" ? line.priceAtAdd : 0;
                return (
                  <TableRow key={`${line.productId ?? idx}-${idx}`}>
                    <TableCell>
                      {line.productId ?? "—"}
                      {line.comment ? (
                        <Typography variant="caption" sx={{ display: "block" }} color="text.secondary">
                          {line.comment}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell align="right">
                      {qty} {line.unitLabel ?? ""}
                    </TableCell>
                    <TableCell align="right">{formatDh(price)}</TableCell>
                    <TableCell align="right">{formatDh(qty * price)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      ) : null}
    </main>
  );
}
