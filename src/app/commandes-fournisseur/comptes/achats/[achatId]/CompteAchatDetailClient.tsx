"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type LigneDetail = {
  product_name: string;
  qte_achat: number;
  montant: number;
};

type AchatDetail = {
  id: string;
  lot_id: string;
  supplier_id: string;
  supplier_label: string;
  label: string;
  account_type: "vendeur" | "station";
  account_id: string;
  montant_total: number;
  date_cloture: string;
  paye: boolean;
};

function accountBackHref(achat: AchatDetail): string {
  if (achat.account_type === "vendeur") {
    return `/commandes-fournisseur/comptes/v/${encodeURIComponent(achat.account_id)}`;
  }
  return `/commandes-fournisseur/comptes/s/${encodeURIComponent(achat.account_id)}`;
}

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function CompteAchatDetailClient() {
  const params = useParams();
  const achatId = String(params.achatId ?? "");
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.comptes.achatDetail");
  const tCommon = useTranslations("common");
  const { formatDateTime } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [achat, setAchat] = useState<AchatDetail | null>(null);
  const [lignes, setLignes] = useState<LigneDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.comptes")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/commandes-fournisseur/comptes/achats/${encodeURIComponent(achatId)}`,
      );
      const json = (await res.json()) as {
        achat?: AchatDetail;
        lignes?: LigneDetail[];
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        setAchat(null);
        return;
      }
      setAchat(json.achat ?? null);
      setLignes(json.lignes ?? []);
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [achatId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("commandes_fournisseur.comptes") || !achatId) return;
    void load();
  }, [permLoading, can, achatId, load]);

  if (permLoading || !can("commandes_fournisseur.comptes")) {
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
        href={achat ? accountBackHref(achat) : "/commandes-fournisseur/comptes"}
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {t("back")}
      </Button>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={32} />
        </Box>
      ) : !achat ? (
        <Typography color="text.secondary">{tCommon("error")}</Typography>
      ) : (
        <>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 1 }}>
            {achat.label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {achat.supplier_label} · {formatDateTime(achat.date_cloture)}
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 3,
              borderColor: achat.paye ? "success.light" : "warning.light",
              bgcolor: achat.paye ? "success.50" : "warning.50",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {formatDh(achat.montant_total)} DH
            </Typography>
            <Typography variant="body2">
              {achat.paye ? t("paidBadge") : t("unpaidBadge")}
            </Typography>
          </Paper>

          {lignes.length > 0 ? (
            <Table size="small" sx={{ mb: 3 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("product")}</TableCell>
                  <TableCell align="right">{t("qty")}</TableCell>
                  <TableCell align="right">{t("amount")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lignes.map((l, i) => (
                  <TableRow key={`${l.product_name}-${i}`}>
                    <TableCell>{l.product_name}</TableCell>
                    <TableCell align="right">{l.qte_achat}</TableCell>
                    <TableCell align="right">{formatDh(l.montant)} DH</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t("noLines")}
            </Typography>
          )}

          <Button
            component={AppLink}
            href={`/commandes-fournisseur/achat/lots/${encodeURIComponent(achat.lot_id)}`}
            variant="outlined"
            size="small"
            sx={{ textTransform: "none", mr: 1 }}
          >
            {t("openLot")}
          </Button>
          <Button
            component={AppLink}
            href={`/api/commandes-fournisseur/achat/lots/${encodeURIComponent(achat.lot_id)}/pdf`}
            variant="outlined"
            size="small"
            target="_blank"
            sx={{ textTransform: "none" }}
          >
            {t("openPdf")}
          </Button>
        </>
      )}
    </main>
  );
}
