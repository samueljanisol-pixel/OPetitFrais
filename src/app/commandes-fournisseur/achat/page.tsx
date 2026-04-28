"use client";

import { Typography, Button } from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AchatPage() {
  const router = useRouter();
  const { loading, can } = useSessionPermissions();

  useEffect(() => {
    if (!loading && !can("commandes_fournisseur.achat")) {
      void router.replace("/access-refuse");
    }
  }, [loading, can, router]);

  if (loading) {
    return <p className="px-4 py-6">Chargement…</p>;
  }

  if (!can("commandes_fournisseur.achat")) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <Typography variant="h5" className="!mb-2" sx={{ fontWeight: 600 }}>
        Achat (lots)
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-6">
        Écran en construction : lots à l&apos;état « Prête », saisie des prix, frais, clôture. Les tables
        `commande_fournisseur_lot_ligne`, `commande_fournisseur_lot_frais` sont en base.
      </Typography>
      <Button component={AppLink} href="/commandes-fournisseur" variant="outlined" fullWidth sx={{ textTransform: "none" }}>
        Retour
      </Button>
    </main>
  );
}
