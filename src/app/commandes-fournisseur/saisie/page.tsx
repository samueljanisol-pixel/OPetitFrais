"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, List, ListItem, ListItemButton, ListItemText, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useMagasinSaisie } from "./MagasinSaisieContext";
import SaisieMagasinStrip from "./SaisieMagasinStrip";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type CmdRow = {
  id: string;
  status: string;
  created_at: string;
  ref_supplier: { label: string } | { label: string }[] | null;
};

function supplierLabel(row: CmdRow, emDash: string): string {
  const r = row.ref_supplier;
  if (!r) return emDash;
  const x = Array.isArray(r) ? r[0] : r;
  return (x as { label?: string })?.label ?? emDash;
}

function isIntegrated(status: string): boolean {
  return status === "integree";
}

function isAnnulee(status: string): boolean {
  return status === "annulee";
}

function sortCmdByCreatedDesc(a: CmdRow, b: CmdRow): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export default function SaisieIndexPage() {
  const router = useRouter();
  const { labelFor } = useStatusLabels();
  const { loading: sLoading, can } = useSessionPermissions();
  const { magasinId, currentMagasin } = useMagasinSaisie();
  const [list, setList] = useState<CmdRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("backoffice.commandes.saisie.index");
  const tStatusList = useTranslations("backoffice.status");
  const te = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const { formatDate } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const emDash = tCommon("emDash");

  const load = useCallback(async () => {
    if (!magasinId) {
      setList([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/commandes-fournisseur/commandes?magasinId=${encodeURIComponent(magasinId)}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as { commandes?: CmdRow[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? te("generic"));
        setList([]);
        return;
      }
      setList(j.commandes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : te("generic"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [magasinId, te]);

  useEffect(() => {
    if (!sLoading && !can("commandes_fournisseur.saisie")) {
      void router.replace("/access-refuse");
      return;
    }
  }, [sLoading, can, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const { enCoursOrders, prisesEnCompteOrders, annuleesOrders } = useMemo(() => {
    const sorted = [...list].sort(sortCmdByCreatedDesc);
    const enCoursOrders = sorted.filter((c) => !isIntegrated(c.status) && !isAnnulee(c.status));
    const prisesEnCompteOrders = sorted.filter((c) => isIntegrated(c.status));
    const annuleesOrders = sorted.filter((c) => isAnnulee(c.status));
    return { enCoursOrders, prisesEnCompteOrders, annuleesOrders };
  }, [list]);

  if (sLoading) {
    return <p className="px-4 py-6 text-slate-600">{tCommon("loading")}</p>;
  }

  if (!can("commandes_fournisseur.saisie")) {
    return null;
  }

  if (!currentMagasin) {
    return (
      <main className="px-4 py-6">
        <Typography color="error">{te("noStoreLinked")}</Typography>
        <Button component={AppLink} href="/" className="!mt-4">
          {tCommon("back")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-4">
      <Button
        component={AppLink}
        href="/"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        {tCommon("home")}
      </Button>
      <SaisieMagasinStrip className="!mb-4" />
      <div className="!mb-4 flex flex-row items-center justify-between">
        <div>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {t("title")}
          </Typography>
        </div>
        <Button
          component={AppLink}
          href="/commandes-fournisseur/saisie/nouvelle"
          variant="contained"
          color="success"
          startIcon={<AddIcon />}
          size="small"
          sx={{ textTransform: "none" }}
        >
          {t("newOrder")}
        </Button>
      </div>

      {err ? (
        <Typography color="error" className="!mb-2">
          {err}
        </Typography>
      ) : null}

      {loading ? (
        <Typography color="text.secondary">{t("loadingOrders")}</Typography>
      ) : list.length === 0 ? (
        <Typography color="text.secondary">{t("emptyOrders")}</Typography>
      ) : (
        <div className="flex flex-col gap-6">
          {enCoursOrders.length > 0 ? (
            <section>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                {tStatusList("listSections.inProgress")}
              </Typography>
              <List dense disablePadding>
                {enCoursOrders.map((c) => (
                  <ListItem key={c.id} disablePadding className="!mb-1">
                    <ListItemButton
                      component={AppLink}
                      href={`/commandes-fournisseur/saisie/${c.id}/recap`}
                      sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}
                    >
                      <ListItemText
                        primary={supplierLabel(c, emDash)}
                        secondary={tStatusList("orderListSecondary", {
                          statusLabel: labelFor("commande_fournisseur", c.status),
                          dateTime: formatDate(c.created_at),
                        })}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </section>
          ) : null}

          {prisesEnCompteOrders.length > 0 ? (
            <section>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                {tStatusList("listSections.integratedReadOnly")}
              </Typography>
              <List dense disablePadding>
                {prisesEnCompteOrders.map((c) => (
                  <ListItem key={c.id} disablePadding className="!mb-1">
                    <ListItemButton
                      component={AppLink}
                      href={`/commandes-fournisseur/saisie/${c.id}/recap`}
                      sx={{
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "action.hover",
                      }}
                    >
                      <ListItemText
                        primary={supplierLabel(c, emDash)}
                        secondary={tStatusList("orderListSecondary", {
                          statusLabel: labelFor("commande_fournisseur", c.status),
                          dateTime: formatDate(c.created_at),
                        })}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </section>
          ) : null}

          {annuleesOrders.length > 0 ? (
            <section>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                {tStatusList("listSections.cancelled")}
              </Typography>
              <List dense disablePadding>
                {annuleesOrders.map((c) => (
                  <ListItem key={c.id} disablePadding className="!mb-1">
                    <ListItemButton
                      component={AppLink}
                      href={`/commandes-fournisseur/saisie/${c.id}/recap`}
                      sx={{
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        opacity: 0.85,
                      }}
                    >
                      <ListItemText
                        primary={supplierLabel(c, emDash)}
                        secondary={tStatusList("orderListSecondary", {
                          statusLabel: labelFor("commande_fournisseur", c.status),
                          dateTime: formatDate(c.created_at),
                        })}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
