"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import ComptePaiementFormDialog from "@/features/commandes-fournisseur/ComptePaiementFormDialog";
import type { CompteAccountType } from "@/lib/commandes-fournisseur/compte-queries";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type AchatRow = {
  id: string;
  lot_id: string;
  label: string;
  montant_total: number;
  date_cloture: string;
  paye: boolean;
};

type PaiementRow = {
  id: string;
  payment_method_label: string;
  date_paiement: string;
  commentaire: string | null;
  montant: number;
  achat_ids: string[];
};

type Totals = { total: number; paye: number; reste: number };

type Props = {
  accountType: CompteAccountType;
  accountId: string;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function accountApiPath(accountType: CompteAccountType, accountId: string): string {
  if (accountType === "vendeur") {
    return `/api/commandes-fournisseur/comptes/v/${encodeURIComponent(accountId)}`;
  }
  return `/api/commandes-fournisseur/comptes/s/${encodeURIComponent(accountId)}`;
}

export default function CompteDetailClient({ accountType, accountId }: Props) {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.comptes.detail");
  const tCommon = useTranslations("common");
  const { formatDateTime } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();

  const [accountLabel, setAccountLabel] = useState("");
  const [parentLabel, setParentLabel] = useState<string | null>(null);
  const [achats, setAchats] = useState<AchatRow[]>([]);
  const [paiements, setPaiements] = useState<PaiementRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, paye: 0, reste: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paiementOpen, setPaiementOpen] = useState(false);

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.comptes")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(accountApiPath(accountType, accountId));
      const json = (await res.json()) as {
        account?: {
          label?: string;
          parent_supplier_label?: string;
        };
        achats?: AchatRow[];
        paiements?: PaiementRow[];
        totals?: Totals;
        error?: string;
      };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        return;
      }
      setAccountLabel(json.account?.label ?? "—");
      setParentLabel(json.account?.parent_supplier_label ?? null);
      setAchats(json.achats ?? []);
      setPaiements(json.paiements ?? []);
      setTotals(json.totals ?? { total: 0, paye: 0, reste: 0 });
      setSelected(new Set());
    } catch {
      setErr(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [accountType, accountId, tCommon]);

  useEffect(() => {
    if (permLoading || !can("commandes_fournisseur.comptes") || !accountId) return;
    void load();
  }, [permLoading, can, accountId, load]);

  const unpaidIds = useMemo(() => achats.filter((a) => !a.paye).map((a) => a.id), [achats]);

  const selectedMontant = useMemo(() => {
    let sum = 0;
    for (const a of achats) {
      if (selected.has(a.id)) sum += a.montant_total;
    }
    return Math.round(sum * 100) / 100;
  }, [achats, selected]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === unpaidIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unpaidIds));
    }
  }

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
        href="/commandes-fournisseur/comptes"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {t("backList")}
      </Button>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {accountLabel}
      </Typography>
      {parentLabel ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("parentSupplier", { label: parentLabel })}
        </Typography>
      ) : (
        <Box sx={{ mb: 2 }} />
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3, display: "flex", flexWrap: "wrap", gap: 3 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("total")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {formatDh(totals.total)} DH
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("paid")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "success.main" }}>
            {formatDh(totals.paye)} DH
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("remaining")}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "warning.main" }}>
            {formatDh(totals.reste)} DH
          </Typography>
        </Box>
      </Paper>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box className="flex justify-center py-8">
          <CircularProgress size={32} />
        </Box>
      ) : (
        <>
          <Box className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t("achatsTitle")}
            </Typography>
            {unpaidIds.length > 0 ? (
              <Button
                variant="contained"
                color="success"
                size="small"
                disabled={selected.size === 0}
                onClick={() => setPaiementOpen(true)}
                sx={{ textTransform: "none" }}
              >
                {t("addPayment")}
              </Button>
            ) : null}
          </Box>

          {unpaidIds.length > 1 ? (
            <Button size="small" onClick={toggleSelectAll} sx={{ textTransform: "none", mb: 1 }}>
              {selected.size === unpaidIds.length ? t("deselectAll") : t("selectAllUnpaid")}
            </Button>
          ) : null}

          <List disablePadding sx={{ mb: 4 }}>
            {achats.map((a) => (
              <ListItem
                key={a.id}
                disablePadding
                sx={{
                  mb: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: a.paye ? "success.light" : "warning.light",
                  bgcolor: a.paye ? "success.50" : "warning.50",
                }}
              >
                {!a.paye ? (
                  <ListItemIcon sx={{ minWidth: 42, pl: 1 }}>
                    <Checkbox
                      edge="start"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                    />
                  </ListItemIcon>
                ) : null}
                <ListItemButton
                  component={AppLink}
                  href={`/commandes-fournisseur/comptes/achats/${encodeURIComponent(a.id)}`}
                  sx={{ py: 1.25 }}
                >
                  <ListItemText
                    primary={formatDateTime(a.date_cloture)}
                    secondary={
                      <>
                        {formatDh(a.montant_total)} DH
                        {a.paye ? ` · ${t("paidBadge")}` : ` · ${t("unpaidBadge")}`}
                      </>
                    }
                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {achats.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                {t("noAchats")}
              </Typography>
            ) : null}
          </List>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {t("paymentsTitle")}
          </Typography>
          {paiements.length === 0 ? (
            <Typography color="text.secondary">{t("noPayments")}</Typography>
          ) : (
            <List disablePadding>
              {paiements.map((p) => (
                <ListItem key={p.id} disablePadding sx={{ mb: 1 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, width: "100%" }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {formatDh(p.montant)} DH — {p.payment_method_label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {p.date_paiement}
                      {p.commentaire ? ` · ${p.commentaire}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("achatsCount", { count: p.achat_ids.length })}
                    </Typography>
                  </Paper>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}

      <ComptePaiementFormDialog
        open={paiementOpen}
        accountType={accountType}
        accountId={accountId}
        achatIds={[...selected]}
        montant={selectedMontant}
        onClose={() => setPaiementOpen(false)}
        onSaved={() => {
          setPaiementOpen(false);
          void load();
        }}
      />
    </main>
  );
}
