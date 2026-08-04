"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import FormDialog from "@/lib/mui/FormDialog";
import { formatMagasinLabel } from "@/lib/clients/pos-caisse-display";
import {
  posLineProductLabel,
  posLineQtyLabel,
  type PosPanierLine,
} from "@/lib/clients/pos-panier-lines";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type CommandeLine = {
  productId?: string;
  productLabel?: string | null;
  qty?: number;
  unitLabel?: string;
  priceAtAdd?: number;
  comment?: string | null;
};

type PanierPayload = {
  label: string;
  display_source: "pos" | "commande";
  montant_total: number;
  paye: boolean;
  submitted_at: string | null;
  pos: {
    ticket_ref: string;
    magasin_code: string | null;
    magasin_nom: string | null;
    caisse_code: string | null;
    total: number;
    lines: PosPanierLine[];
    sold_at: string | null;
    has_line_detail: boolean;
  } | null;
  commande: {
    cart_number: number;
    label: string;
    montant_total: number;
    submitted_at: string | null;
    fulfillment_mode: string | null;
    payment_method: string | null;
    order_comment: string | null;
    lines: CommandeLine[];
  };
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

function LinesTable({
  lines,
  productLabel,
  qtyLabel,
  priceLabel,
  lineTotalLabel,
  getProduct,
  getQty,
  getPrice,
}: {
  lines: unknown[];
  productLabel: string;
  qtyLabel: string;
  priceLabel: string;
  lineTotalLabel: string;
  getProduct: (line: unknown, idx: number) => ReactNode;
  getQty: (line: unknown) => string;
  getPrice: (line: unknown) => number;
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>{productLabel}</TableCell>
          <TableCell align="right">{qtyLabel}</TableCell>
          <TableCell align="right">{priceLabel}</TableCell>
          <TableCell align="right">{lineTotalLabel}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line, idx) => {
          const qty = getQty(line);
          const price = getPrice(line);
          const qtyNum = typeof (line as { qty?: number }).qty === "number" ? (line as { qty: number }).qty : 0;
          const lineTotal =
            typeof (line as { lineTotal?: number }).lineTotal === "number"
              ? (line as { lineTotal: number }).lineTotal
              : qtyNum * price;
          return (
            <TableRow key={idx}>
              <TableCell>{getProduct(line, idx)}</TableCell>
              <TableCell align="right">{qty}</TableCell>
              <TableCell align="right">{formatDh(price)}</TableCell>
              <TableCell align="right">{formatDh(lineTotal)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
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
  const [panier, setPanier] = useState<PanierPayload | null>(null);
  const [commandeOpen, setCommandeOpen] = useState(false);

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
      const json = (await res.json()) as { panier?: PanierPayload; error?: string };
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

  const isPos = panier?.display_source === "pos" && panier.pos != null;
  const displayLines = isPos
    ? panier.pos!.has_line_detail
      ? panier.pos!.lines
      : []
    : panier?.commande.lines ?? [];

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
          {isPos ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t("fromCommande", { number: panier.commande.cart_number })}
            </Alert>
          ) : null}

          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            {isPos ? (
              <>
                <Typography variant="body2">
                  {t("ticketRef")} : {panier.pos!.ticket_ref}
                </Typography>
                {formatMagasinLabel(panier.pos!) ? (
                  <Typography variant="body2">
                    {t("magasin")} : {formatMagasinLabel(panier.pos!)}
                  </Typography>
                ) : null}
                {panier.pos!.caisse_code ? (
                  <Typography variant="body2">
                    {t("caisse")} : {panier.pos!.caisse_code}
                  </Typography>
                ) : null}
                {panier.pos!.sold_at ? (
                  <Typography variant="body2">
                    {t("cashedAt")} : {formatDateTime(panier.pos!.sold_at)}
                  </Typography>
                ) : null}
              </>
            ) : (
              <>
                <Typography variant="body2">
                  {t("orderNumber")} : #{panier.commande.cart_number}
                </Typography>
                <Typography variant="body2">
                  {t("submitted")} :{" "}
                  {panier.commande.submitted_at ? formatDateTime(panier.commande.submitted_at) : "—"}
                </Typography>
              </>
            )}
            <Typography variant="body2">
              {t("total")} : {formatDh(panier.montant_total)} DH
            </Typography>
            <Typography variant="body2">
              {t("status")} : {panier.paye ? t("paidBadge") : t("unpaidBadge")}
            </Typography>
            {!isPos && panier.commande.fulfillment_mode ? (
              <Typography variant="body2">
                {t("fulfillment")} : {panier.commande.fulfillment_mode}
              </Typography>
            ) : null}
            {!isPos && panier.commande.payment_method ? (
              <Typography variant="body2">
                {t("paymentPref")} : {panier.commande.payment_method}
              </Typography>
            ) : null}
            {!isPos && panier.commande.order_comment ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {t("comment")} : {panier.commande.order_comment}
              </Typography>
            ) : null}
          </Paper>

          {isPos ? (
            <Box sx={{ mb: 2 }}>
              <Button variant="outlined" size="small" onClick={() => setCommandeOpen(true)}>
                {t("viewOriginalCommande")}
              </Button>
            </Box>
          ) : null}

          {isPos && !panier.pos!.has_line_detail ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t("posLinesMissing")}
            </Alert>
          ) : null}

          {displayLines.length > 0 ? (
            isPos ? (
              <LinesTable
                lines={displayLines}
                productLabel={t("product")}
                qtyLabel={t("qty")}
                priceLabel={t("price")}
                lineTotalLabel={t("lineTotal")}
                getProduct={(line) => posLineProductLabel(line as PosPanierLine)}
                getQty={(line) => posLineQtyLabel(line as PosPanierLine)}
                getPrice={(line) =>
                  typeof (line as PosPanierLine).unitPrice === "number"
                    ? (line as PosPanierLine).unitPrice!
                    : 0
                }
              />
            ) : (
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
                  {displayLines.map((line, idx) => {
                    const row = line as CommandeLine;
                    const qty = typeof row.qty === "number" ? row.qty : 0;
                    const price = typeof row.priceAtAdd === "number" ? row.priceAtAdd : 0;
                    return (
                      <TableRow key={`${row.productId ?? idx}-${idx}`}>
                        <TableCell>
                          {row.productLabel ?? row.unitLabel ?? "—"}
                          {row.comment ? (
                            <Typography
                              variant="caption"
                              sx={{ display: "block" }}
                              color="text.secondary"
                            >
                              {row.comment}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell align="right">
                          {qty} {row.unitLabel ?? ""}
                        </TableCell>
                        <TableCell align="right">{formatDh(price)}</TableCell>
                        <TableCell align="right">{formatDh(qty * price)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : null}

          <FormDialog open={commandeOpen} onClose={() => setCommandeOpen(false)} fullWidth maxWidth="sm">
            <DialogTitle>
              {t("originalCommandeTitle", { number: panier.commande.cart_number })}
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {t("submitted")} :{" "}
                {panier.commande.submitted_at ? formatDateTime(panier.commande.submitted_at) : "—"}
                {" · "}
                {t("total")} : {formatDh(panier.commande.montant_total)} DH
              </Typography>
              {panier.commande.order_comment ? (
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {t("comment")} : {panier.commande.order_comment}
                </Typography>
              ) : null}
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
                  {panier.commande.lines.map((line, idx) => {
                    const qty = typeof line.qty === "number" ? line.qty : 0;
                    const price = typeof line.priceAtAdd === "number" ? line.priceAtAdd : 0;
                    return (
                      <TableRow key={`cmd-${line.productId ?? idx}-${idx}`}>
                        <TableCell>
                          {line.productLabel ?? line.unitLabel ?? "—"}
                          {line.comment ? (
                            <Typography
                              variant="caption"
                              sx={{ display: "block" }}
                              color="text.secondary"
                            >
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
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCommandeOpen(false)}>{tCommon("close")}</Button>
            </DialogActions>
          </FormDialog>
        </>
      ) : null}
    </main>
  );
}
