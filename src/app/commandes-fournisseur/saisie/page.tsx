"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, List, ListItem, ListItemButton, ListItemText, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useMagasinSaisie } from "./MagasinSaisieContext";
import SaisieMagasinStrip from "./SaisieMagasinStrip";

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

export default function SaisieIndexPage() {
  const router = useRouter();
  const { loading: sLoading, can, displayName } = useSessionPermissions();
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
      <SaisieMagasinStrip className="!mb-4" />
      <div className="!mb-4 flex flex-row items-center justify-between">
        <div>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Mes commandes
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {displayName} — {currentMagasin.nom}
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
        <List dense disablePadding>
          {list.map((c) => (
            <ListItem key={c.id} disablePadding className="!mb-1">
              <ListItemButton
                component={AppLink}
                href={`/commandes-fournisseur/saisie/${c.id}/recap`}
                sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}
              >
                <ListItemText
                  primary={supplierLabel(c)}
                  secondary={`${c.status} — ${new Date(c.created_at).toLocaleString("fr-FR")}`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      <Button component={AppLink} href="/commandes-fournisseur" color="inherit" className="!mt-6" fullWidth>
        Retour commandes
      </Button>
    </main>
  );
}
