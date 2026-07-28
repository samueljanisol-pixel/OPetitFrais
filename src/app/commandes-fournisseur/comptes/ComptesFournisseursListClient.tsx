"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import type { CompteAccountType } from "@/lib/commandes-fournisseur/compte-queries";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type AccountSummary = {
  account_type: CompteAccountType;
  account_id: string;
  label: string;
  parent_supplier_label?: string;
  total: number;
  paye: number;
  reste: number;
};

function formatDh(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function accountHref(a: AccountSummary): string {
  if (a.account_type === "vendeur") {
    return `/commandes-fournisseur/comptes/v/${encodeURIComponent(a.account_id)}`;
  }
  return `/commandes-fournisseur/comptes/s/${encodeURIComponent(a.account_id)}`;
}

export default function ComptesFournisseursListClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.comptes.list");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: permLoading, can } = useSessionPermissions();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
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
      const res = await fetch("/api/commandes-fournisseur/comptes/suppliers");
      const json = (await res.json()) as { accounts?: AccountSummary[]; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tCommon("error"));
        setAccounts([]);
        return;
      }
      setAccounts(json.accounts ?? []);
    } catch {
      setErr(tCommon("networkError"));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [tCommon]);

  useEffect(() => {
    if (permLoading || !can("commandes_fournisseur.comptes")) return;
    void load();
  }, [permLoading, can, load]);

  if (permLoading || !can("commandes_fournisseur.comptes")) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <p className="text-slate-600">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <Button
        component={AppLink}
        href="/"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{ textTransform: "none", mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
      >
        {tCommon("home")}
      </Button>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mb: 3 }}>
        {t("title")}
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
      ) : accounts.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">{t("empty")}</Typography>
        </Paper>
      ) : (
        <List disablePadding>
          {accounts.map((a) => (
            <ListItem key={`${a.account_type}-${a.account_id}`} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                component={AppLink}
                href={accountHref(a)}
                sx={{
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <ListItemText
                  primary={a.label}
                  secondary={
                    <>
                      {a.parent_supplier_label ? (
                        <>
                          {t("parentSupplier", { label: a.parent_supplier_label })}
                          {" · "}
                        </>
                      ) : null}
                      {t("total")} : {formatDh(a.total)} DH · {t("reste")} :{" "}
                      <Box
                        component="span"
                        sx={{
                          color: a.reste > 0 ? "warning.main" : "success.main",
                          fontWeight: 600,
                        }}
                      >
                        {formatDh(a.reste)} DH
                      </Box>
                    </>
                  }
                  slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </main>
  );
}
