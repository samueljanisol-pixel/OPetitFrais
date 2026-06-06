"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";

export default function CuisineLandingClient() {
  const router = useRouter();
  const tCommon = useTranslations("common");
  const { loading, canCuisineSaisie, canCuisineHistorique } = useSessionPermissions();

  useEffect(() => {
    if (loading) return;
    if (canCuisineSaisie) {
      void router.replace("/cuisine/saisie");
      return;
    }
    if (canCuisineHistorique) {
      void router.replace("/cuisine/historique");
      return;
    }
    void router.replace("/access-refuse");
  }, [loading, canCuisineSaisie, canCuisineHistorique, router]);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <p className="text-slate-600">{tCommon("loading")}</p>
    </main>
  );
}
