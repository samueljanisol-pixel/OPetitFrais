"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";

export default function CommandesFournisseurLandingClient() {
  const router = useRouter();
  const {
    loading,
    isFullAccess,
    isAdministrator,
    canCommandesFournisseurSaisie,
    canCommandesFournisseurConsolidation,
    canCommandesFournisseurAchat,
  } = useSessionPermissions();
  const [redirecting, setRedirecting] = useState(true);

  const isHub = Boolean(isFullAccess || isAdministrator);

  useEffect(() => {
    if (loading) return;
    if (isHub) {
      setRedirecting(false);
      return;
    }
    if (canCommandesFournisseurSaisie) {
      void router.replace("/commandes-fournisseur/saisie");
      return;
    }
    if (canCommandesFournisseurConsolidation) {
      void router.replace("/commandes-fournisseur/validation");
      return;
    }
    if (canCommandesFournisseurAchat) {
      void router.replace("/commandes-fournisseur/achat");
      return;
    }
    void router.replace("/access-refuse");
  }, [
    loading,
    isHub,
    canCommandesFournisseurSaisie,
    canCommandesFournisseurConsolidation,
    canCommandesFournisseurAchat,
    router,
  ]);

  if (loading || (redirecting && !isHub)) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <p className="text-slate-600">Chargement…</p>
      </main>
    );
  }

  if (!isHub) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
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
        Retour accueil
      </Button>
      <Typography variant="h5" component="h1" className="!mb-1" sx={{ fontWeight: 600 }}>
        Commandes fournisseur
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-6">
        Choisissez l&apos;espace à ouvrir
      </Typography>
      <div className="flex flex-col gap-3">
        {canCommandesFournisseurSaisie || isFullAccess ? (
          <Button
            component={AppLink}
            href="/commandes-fournisseur/saisie"
            variant="contained"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            Saisie magasins
          </Button>
        ) : null}
        {canCommandesFournisseurConsolidation || isFullAccess ? (
          <Button
            component={AppLink}
            href="/commandes-fournisseur/validation"
            variant="outlined"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            Validation
          </Button>
        ) : null}
        {canCommandesFournisseurAchat || isFullAccess ? (
          <Button
            component={AppLink}
            href="/commandes-fournisseur/achat"
            variant="outlined"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            Achat
          </Button>
        ) : null}
      </div>
    </main>
  );
}
