"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, List, ListItem, ListItemButton, ListItemText, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useMagasinSaisie } from "./MagasinSaisieContext";
import SaisieMagasinStrip from "./SaisieMagasinStrip";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";

type CmdRow = {
  id: string;
  status: string;
  created_at: string;
  ref_supplier: { label: string } | { label: string }[] | null;
};

function supplierLabel(row: CmdRow): string {
  const r = row.ref_supplier;
  if (!r) return "—";
  const x = Array.isArray(r) ? r[0] : r;
  return (x as { label?: string })?.label ?? "—";
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
        setErr(j.error ?? "Erreur");
        setList([]);
        return;
      }
      setList(j.commandes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [magasinId]);

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
    return <p className="px-4 py-6 text-slate-600">Chargement…</p>;
  }

  if (!can("commandes_fournisseur.saisie")) {
    return null;
  }

  if (!currentMagasin) {
    return (
      <main className="px-4 py-6">
        <Typography color="error">Aucun magasin n&apos;est rattaché à votre profil.</Typography>
        <Button component={AppLink} href="/" className="!mt-4">
          Retour
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
        startIcon={<ChevronLeftIcon fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        Accueil
      </Button>
      <SaisieMagasinStrip className="!mb-4" />
      <div className="!mb-4 flex flex-row items-center justify-between">
        <div>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Commandes Fournisseur
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
          Nouvelle
        </Button>
      </div>

      {err ? (
        <Typography color="error" className="!mb-2">
          {err}
        </Typography>
      ) : null}

      {loading ? (
        <Typography color="text.secondary">Chargement des commandes…</Typography>
      ) : list.length === 0 ? (
        <Typography color="text.secondary">Aucune commande. Créez-en une.</Typography>
      ) : (
        <div className="flex flex-col gap-6">
          {enCoursOrders.length > 0 ? (
            <section>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                En cours
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
                        primary={supplierLabel(c)}
                        secondary={`${labelFor("commande_fournisseur", c.status)} — ${new Date(c.created_at).toLocaleString("fr-FR")}`}
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
                Prises en compte (non modifiables)
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
                        primary={supplierLabel(c)}
                        secondary={`${labelFor("commande_fournisseur", c.status)} — ${new Date(c.created_at).toLocaleString("fr-FR")}`}
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
                Annulées
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
                        primary={supplierLabel(c)}
                        secondary={`${labelFor("commande_fournisseur", c.status)} — ${new Date(c.created_at).toLocaleString("fr-FR")}`}
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
