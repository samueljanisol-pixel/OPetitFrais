import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import ParcoursClient from "./ParcoursClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function ParcoursPage({ params }: PageProps) {
  const { id } = await params;
  const t = await getTranslations("backoffice.commandes.parcours");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<p className="px-4 py-4 text-slate-600">{t("loading")}</p>}>
        <ParcoursClient commandeId={id} />
      </Suspense>
    </div>
  );
}
