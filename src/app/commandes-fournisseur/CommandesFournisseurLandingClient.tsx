"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Typography } from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

export default function CommandesFournisseurLandingClient() {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.landing");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
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
        <p className="text-slate-600">{tCommon("loading")}</p>
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
      <Typography variant="h5" component="h1" className="!mb-1" sx={{ fontWeight: 600 }}>
        {t("title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" className="!mb-6">
        {t("subtitle")}
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
            sx={{ borderRadius: 2, textTransform: "none", py: 1.25 }}
          >
            {t("navSaisie")}
          </Button>
        ) : null}
        {canCommandesFournisseurConsolidation || isFullAccess ? (
          <Button
            component={AppLink}
            href="/commandes-fournisseur/validation"
            variant="contained"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 2, textTransform: "none", py: 1.25 }}
          >
            {t("navValidation")}
          </Button>
        ) : null}
        {canCommandesFournisseurAchat || isFullAccess ? (
          <Button
            component={AppLink}
            href="/commandes-fournisseur/achat"
            variant="contained"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 2, textTransform: "none", py: 1.25 }}
          >
            {t("navAchat")}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
